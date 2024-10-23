import { Duration, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { ConfigProps } from "./config";
import {
  NodejsFunction,
  NodejsFunctionProps,
} from "aws-cdk-lib/aws-lambda-nodejs";
import { Runtime, StartingPosition } from "aws-cdk-lib/aws-lambda";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import { Queue } from "aws-cdk-lib/aws-sqs";
import path = require("path");
import { Stream } from "aws-cdk-lib/aws-kinesis";
import { KinesisEventSource } from "aws-cdk-lib/aws-lambda-event-sources";

type HftStackProps = StackProps & {
  config: Readonly<ConfigProps>;
  dataStream: Stream;
};

export class HftAppStack extends Stack {
  readonly operationsQueue: Queue;

  constructor(scope: Construct, id: string, props: HftStackProps) {
    super(scope, id, props);

    const { config } = props;

    const queueExecuteOperations = new Queue(
      this,
      "ExecuteOperationsQueue.fifo",
      {
        fifo: true,
        queueName: "queue-execute-operations-" + config.STAGE + ".fifo",
        visibilityTimeout: Duration.seconds(300),
        retentionPeriod: Duration.hours(24),
      }
    );

    this.operationsQueue = queueExecuteOperations;

    const defaultLambdaProps: NodejsFunctionProps = {
      memorySize: 256,
      runtime: Runtime.NODEJS_20_X,
      bundling: {
        sourceMap: true,
      },
      logRetention: RetentionDays.ONE_MONTH,
      environment: {
        EXECUTE_OPERATIONS_QUEUE_URL: queueExecuteOperations.queueUrl,
      },
    };

    // Lambda to create a initial balance for a new user
    const functionHftSystem = new NodejsFunction(this, "HftSystemLambda", {
      ...defaultLambdaProps,
      timeout: Duration.minutes(1),
      functionName: "lambda-hft-system-" + config.STAGE,
      entry: path.resolve("src/hft-app/HftSystem.ts"),
    });

    queueExecuteOperations.grantSendMessages(functionHftSystem);

    functionHftSystem.addEventSource(
      new KinesisEventSource(props.dataStream, {
        startingPosition: StartingPosition.TRIM_HORIZON,
        batchSize: 10,
        reportBatchItemFailures: true,
      })
    );
  }
}
