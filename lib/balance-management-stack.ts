import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { ConfigProps } from "./config";
import {
  CorsHttpMethod,
  HttpApi,
  HttpMethod,
} from "aws-cdk-lib/aws-apigatewayv2";
import { AttributeType, BillingMode, Table } from "aws-cdk-lib/aws-dynamodb";
import {
  NodejsFunction,
  NodejsFunctionProps,
} from "aws-cdk-lib/aws-lambda-nodejs";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import path = require("path");
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";

type BalanceManagementStackProps = StackProps & {
  config: Readonly<ConfigProps>;
};

export class BalanceManagementStack extends Stack {
  constructor(
    scope: Construct,
    id: string,
    props: BalanceManagementStackProps
  ) {
    super(scope, id, props);

    const { config } = props;

    // Http API to handle requests
    const httpApi = new HttpApi(this, "HttpApi", {
      apiName: "http-api-" + config.STAGE,
      createDefaultStage: true,
      corsPreflight: {
        allowHeaders: ["*"],
        allowMethods: [CorsHttpMethod.ANY],
        allowOrigins: ["*"],
      },
    });

    // Table to store user balance
    const tableUserBalance = new Table(this, "UserBalanceTable", {
      tableName: "table-user-balance-" + config.STAGE,
      billingMode: BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: "userId",
        type: AttributeType.STRING,
      },
      sortKey: {
        name: "activeSymbol",
        type: AttributeType.STRING,
      },
    });

    // Default props to apply in lambdas
    const defaultLambdaProps: NodejsFunctionProps = {
      memorySize: 256,
      runtime: Runtime.NODEJS_20_X,
      bundling: {
        sourceMap: true,
      },
      logRetention: RetentionDays.ONE_MONTH,
      environment: {
        USER_BALANCE_TABLE_NAME: tableUserBalance.tableName,
      },
    };

    // Lambda to create a initial balance for a new user
    const functionCreateInitialBalance = new NodejsFunction(
      this,
      "CreateInitialBalanceFunction",
      {
        ...defaultLambdaProps,
        functionName: "lambda-create-initial-balance-" + config.STAGE,
        entry: path.resolve(
          "src/balance-management/lambdas/CreateInitialBalance.ts"
        ),
      }
    );

    tableUserBalance.grantReadWriteData(functionCreateInitialBalance);

    // Lambda to get the balance for a user
    const functionGetCurrentBalance = new NodejsFunction(
      this,
      "GetCurrentBalance",
      {
        ...defaultLambdaProps,
        functionName: "lambda-get-current-balance-" + config.STAGE,
        entry: path.resolve(
          "src/balance-management/lambdas/GetCurrentBalance.ts"
        ),
      }
    );

    tableUserBalance.grantWriteData(functionGetCurrentBalance);
    tableUserBalance.grant(functionGetCurrentBalance, "dynamodb:Query");

    // Function to add holds to user
    const functionAddHoldings = new NodejsFunction(
      this,
      "AddHoldingsFunction",
      {
        ...defaultLambdaProps,
        functionName: "lambda-add-holdings-" + config.STAGE,
        entry: path.resolve("src/balance-management/lambdas/AddHoldings.ts"),
      }
    );

    tableUserBalance.grantReadWriteData(functionAddHoldings);

    // Route to create a initial balance
    httpApi.addRoutes({
      path: "/balance",
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration(
        "CreateInitialBalanceIntegration",
        functionCreateInitialBalance
      ),
    });

    // Route to get the current balance for user
    httpApi.addRoutes({
      path: "/balance/{userId}",
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration(
        "GetCurrentBalanceIntegration",
        functionGetCurrentBalance
      ),
    });

    // Route to add holdings to user
    httpApi.addRoutes({
      path: "/balance/add-holdings",
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration(
        "AddHoldingsIntegration",
        functionAddHoldings
      ),
    });
  }
}
