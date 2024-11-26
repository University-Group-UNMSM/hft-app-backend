import { Duration, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { ConfigProps } from "./config";
import { AttributeType, BillingMode, Table } from "aws-cdk-lib/aws-dynamodb";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import { Queue } from "aws-cdk-lib/aws-sqs";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import path = require("path");

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

    functionProcessHistoryOperation.addEventSource(
      new SqsEventSource(props.operationsHistoryQueue, {
        batchSize: 5,
        reportBatchItemFailures: true,
        maxConcurrency: 2,
      })
    );
  }
}