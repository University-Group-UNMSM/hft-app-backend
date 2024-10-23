import { Duration, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { ConfigProps } from "./config";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import path = require("path");
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import type { Queue } from "aws-cdk-lib/aws-sqs";

type ExecuteOperationsStackProps = StackProps & {
  config: Readonly<ConfigProps>;
  operationsQueue: Queue;
};

export class ExecuteOperationsStack extends Stack {
  constructor(
    scope: Construct,
    id: string,
    props: ExecuteOperationsStackProps
  ) {
    super(scope, id, props);

    const { config } = props;

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
        functionName:
          "lambda-process-operation-with-broker-api-" + config.STAGE,
        timeout: Duration.seconds(30),
      }
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
