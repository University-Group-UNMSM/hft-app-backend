import { Duration, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import { ConfigProps } from "./config";
import { Construct } from "constructs";
import { Topic } from "aws-cdk-lib/aws-sns";
import { Rule, Schedule } from "aws-cdk-lib/aws-events";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Code, Function, LayerVersion, Runtime } from "aws-cdk-lib/aws-lambda";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import { LambdaSubscription } from "aws-cdk-lib/aws-sns-subscriptions";
import path = require("path");
import { Stream, StreamMode } from "aws-cdk-lib/aws-kinesis";
import { SnsTopic } from "aws-cdk-lib/aws-events-targets";

type DataExtractionStackProps = StackProps & {
  config: Readonly<ConfigProps>;
};

export class DataExtractionStack extends Stack {
  readonly dataStream: Stream;

  constructor(scope: Construct, id: string, props: DataExtractionStackProps) {
    super(scope, id, props);

    const { config } = props;

    // Topic to call lambdas an extract data from apis
    const topicGetDataFromExternalSources = new Topic(
      this,
      "GetDataFromExternalSourcesTopic",
      {
        topicName: "get-data-from-external-sources-" + config.STAGE,
      }
    );

    // EventBridge scheduled event to call topic every day
    const ruleScheduledEventToGetDataFromExternalSources = new Rule(
      this,
      "ScheduledEventToGetDataFromExternalSourcesRule",
      {
        schedule: Schedule.rate(Duration.hours(1)),
      }
    );

    ruleScheduledEventToGetDataFromExternalSources.addTarget(
      new SnsTopic(topicGetDataFromExternalSources)
    );

    // Kinesis stream to store data
    const streamExternalSourcesData = new Stream(this, "ExternalSourcesData", {
      streamName: "stream-external-sources-data-" + config.STAGE,
      streamMode: StreamMode.PROVISIONED,
      shardCount: 1,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.dataStream = streamExternalSourcesData;

    const functionGetDataFromCoinMarketCap = new NodejsFunction(
      this,
      "GetDataFromCoinMarketCapFunction",
      {
        memorySize: 256,
        runtime: Runtime.NODEJS_20_X,
        bundling: {
          sourceMap: true,
        },
        logRetention: RetentionDays.ONE_MONTH,
        environment: {
          COINMARKETCAP_API_KEY: config.COINMARKETCAP_API_KEY,
          KINESIS_STREAM_NAME: streamExternalSourcesData.streamName,
        },
        functionName: "lambda-get-data-from-coinmarketcap-" + config.STAGE,
        entry: path.resolve(
          "src/data-extraction/lambdas/GetDataFromCoinMarketCap.ts"
        ),
      }
    );

    streamExternalSourcesData.grantReadWrite(functionGetDataFromCoinMarketCap);

    // Layer para lambdas de python
    const layerPythonFunctions = new LayerVersion(
      this,
      "PythonFunctionsLayer",
      {
        code: Code.fromAsset("src/data-extraction/layers"),
        compatibleRuntimes: [Runtime.PYTHON_3_10],
        layerVersionName: "layer-python-functions-" + config.STAGE,
      }
    );

    const layerPandasPythonPackage = LayerVersion.fromLayerVersionArn(
      this,
      "PythonPandasPackageLayer",
      "arn:aws:lambda:us-east-1:770693421928:layer:Klayers-p310-pandas:17"
    );

    const functionGetDataFromYahooFinance = new Function(
      this,
      "GetDataFromYahooFinanceFunction",
      {
        functionName: "lambda-get-data-from-yahoo-finance-" + config.STAGE,
        runtime: Runtime.PYTHON_3_10,
        code: Code.fromAsset("src/data-extraction/lambdas"),
        handler: "GetDataFromYahooFinance.lambda_handler",
        layers: [layerPythonFunctions, layerPandasPythonPackage],
        timeout: Duration.seconds(30),
        logRetention: RetentionDays.ONE_MONTH,
        environment: {
          KINESIS_STREAM_NAME: streamExternalSourcesData.streamName,
        },
      }
    );

    streamExternalSourcesData.grantReadWrite(functionGetDataFromYahooFinance);

    topicGetDataFromExternalSources.addSubscription(
      new LambdaSubscription(functionGetDataFromCoinMarketCap)
    );

    topicGetDataFromExternalSources.addSubscription(
      new LambdaSubscription(functionGetDataFromYahooFinance)
    );
  }
}
