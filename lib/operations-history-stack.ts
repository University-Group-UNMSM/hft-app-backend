import { Duration, Expiration, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { ConfigProps } from "./config";
import { AttributeType, BillingMode, Table } from "aws-cdk-lib/aws-dynamodb";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import { Queue } from "aws-cdk-lib/aws-sqs";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import path = require("path");
import { HttpApi, HttpRoute, HttpRouteKey } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpMethod } from "aws-cdk-lib/aws-events";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import {
  AuthorizationType,
  Definition,
  GraphqlApi,
  MappingTemplate,
  NoneDataSource,
  Resolver,
} from "aws-cdk-lib/aws-appsync";

type OperationsHistoryStackProps = StackProps & {
  config: Readonly<ConfigProps>;
  operationsHistoryQueue: Queue;
};

export class OperationsHistoryStack extends Stack {
  constructor(
    scope: Construct,
    id: string,
    props: OperationsHistoryStackProps
  ) {
    super(scope, id, props);

    const { config } = props;

    const httpApi = HttpApi.fromHttpApiAttributes(this, "HttpApi", {
      httpApiId: config.HTTP_API_ID,
    });

    const realTimeApi = new GraphqlApi(this, "OperationsHistoryRealTimeApi", {
      name: "OperationsHistoryRealTimeApi",
      definition: Definition.fromFile(
        "src/operations-history/static/schema.graphql"
      ),
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: AuthorizationType.API_KEY,
          apiKeyConfig: {
            name: "OperationsHistoryRealTimeApiKey",
            description: "API Key for Operations History Real Time API",
            expires: Expiration.after(Duration.days(365)),
          },
        },
      },
    });

    const noneRealTimeDataSource = new NoneDataSource(
      this,
      "OperationsHistoryRealTimeNoneDataSource",
      {
        api: realTimeApi,
        description: "None data source",
        name: "OperationsHistoryRealTimeNoneDataSource",
      }
    );

    new Resolver(this, "RealTimeAPIResolver", {
      api: realTimeApi,
      typeName: "Mutation",
      fieldName: "publish",
      dataSource: noneRealTimeDataSource,
      requestMappingTemplate: MappingTemplate.fromString(`
        {
          "version": "2017-02-28",
          "payload": {
              "name": "$context.arguments.name",
              "data": $util.toJson($context.arguments.data)
          }
        }
      `),
      responseMappingTemplate: MappingTemplate.fromString(`
        $util.toJson($context.result)
      `),
    });

    const tableOperationsHistory = new Table(this, "OperationsHistoryTable", {
      tableName: "table-operations-history-" + config.STAGE,
      billingMode: BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: "userId",
        type: AttributeType.STRING,
      },
      sortKey: {
        name: "timestamp",
        type: AttributeType.STRING,
      },
    });

    const functionProcessHistoryOperation = new NodejsFunction(
      this,
      "ProcessHistoryOperationFunction",
      {
        memorySize: 256,
        runtime: Runtime.NODEJS_20_X,
        bundling: {
          sourceMap: true,
        },
        timeout: Duration.seconds(30),
        logRetention: RetentionDays.ONE_MONTH,
        functionName: "lambda-process-history-operation-" + config.STAGE,
        environment: {
          OPERATIONS_HISTORY_TABLE_NAME: tableOperationsHistory.tableName,
        },
        entry: path.resolve(
          "src/operations-history/lambdas/ProcessHistoryOperation.ts"
        ),
      }
    );

    tableOperationsHistory.grantReadWriteData(functionProcessHistoryOperation);

    const functionGetOperationsHistoryByUser = new NodejsFunction(
      this,
      "GetOperationsHistoryByUseFunction",
      {
        memorySize: 256,
        runtime: Runtime.NODEJS_20_X,
        bundling: {
          sourceMap: true,
        },
        timeout: Duration.seconds(30),
        logRetention: RetentionDays.ONE_MONTH,
        functionName: "lambda-get-operations-history-" + config.STAGE,
        environment: {
          OPERATIONS_HISTORY_TABLE_NAME: tableOperationsHistory.tableName,
        },
        entry: path.resolve(
          "src/operations-history/lambdas/GetOperationsHistoryByUser.ts"
        ),
      }
    );

    tableOperationsHistory.grantReadWriteData(
      functionGetOperationsHistoryByUser
    );

    const functionSendHistoryOperationRealTime = new NodejsFunction(
      this,
      "SendHistoryOperationRealTimeFunction",
      {
        memorySize: 256,
        runtime: Runtime.NODEJS_20_X,
        bundling: {
          sourceMap: true,
        },
        timeout: Duration.seconds(30),
        logRetention: RetentionDays.ONE_MONTH,
        functionName: "lambda-send-operation-record-real-time-" + config.STAGE,
        environment: {
          APP_SYNC_API_URL: realTimeApi.graphqlUrl,
          APP_SYNC_API_KEY: realTimeApi.apiKey!,
        },
        entry: path.resolve(
          "src/operations-history/lambdas/SendHistoryOperationRealTime.ts"
        ),
      }
    );

    functionProcessHistoryOperation.addEventSource(
      new SqsEventSource(props.operationsHistoryQueue, {
        batchSize: 5,
        reportBatchItemFailures: true,
        maxConcurrency: 2,
      })
    );

    new HttpRoute(this, "GetOperationsHistoryByUserRoute", {
      httpApi,
      routeKey: HttpRouteKey.with(
        "/operations/history/{userId}",
        HttpMethod.GET
      ),
      integration: new HttpLambdaIntegration(
        "GetOperationsHistoryByUserIntegration",
        functionGetOperationsHistoryByUser
      ),
    });
  }
}
