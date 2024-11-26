import { Duration, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { ConfigProps } from "./config";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import path = require("path");
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { Queue } from "aws-cdk-lib/aws-sqs";
import { Table } from "aws-cdk-lib/aws-dynamodb";

type ExecuteOperationsStackProps = StackProps & {
  config: Readonly<ConfigProps>;
  operationsQueue: Queue;
  userBalanceTable: Table;
};

export class ExecuteOperationsStack extends Stack {
  readonly operationsHistoryQueue: Queue;

  constructor(
    scope: Construct,
    id: string,
    props: ExecuteOperationsStackProps
  ) {
    super(scope, id, props);

    const { config } = props;

    const queueOperationsHistory = new Queue(this, "OperationsHistoryQueue", {
      queueName: "queue-operations-history-" + config.STAGE,
      visibilityTimeout: Duration.seconds(300),
      retentionPeriod: Duration.days(1),
    });

    this.operationsHistoryQueue = queueOperationsHistory;

    const functionProcessOperationWithIBKApi = new NodejsFunction(
      this,
      "ProcessOperationWithIBKApiFunction",
      {
        memorySize: 256,
        runtime: Runtime.NODEJS_20_X,
        bundling: {
          sourceMap: true,
        },
        logRetention: RetentionDays.ONE_MONTH,
        entry: path.resolve(
          "src/execute-operations/lambdas/ProcessOperationWithBroker.ts"
        ),
        environment: {
          OPERATIONS_HISTORY_QUEUE_URL: queueOperationsHistory.queueUrl,
          USER_BALANCE_TABLE_NAME: props.userBalanceTable.tableName,
        },
        functionName:
          "lambda-process-operation-with-broker-api-" + config.STAGE,
        timeout: Duration.seconds(30),
      }
    );

    queueOperationsHistory.grantSendMessages(
      functionProcessOperationWithIBKApi
    );

    props.userBalanceTable.grantReadWriteData(
      functionProcessOperationWithIBKApi
    );

    functionProcessOperationWithIBKApi.addEventSource(
      new SqsEventSource(props.operationsQueue, {
        batchSize: 5,
        reportBatchItemFailures: true,
        maxConcurrency: 2,
      })
    );
  }
}
