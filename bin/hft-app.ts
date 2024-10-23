#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { HftAppStack } from "../lib/hft-app-stack";
import { getConfig } from "../lib/config";
import { BalanceManagementStack } from "../lib/balance-management-stack";
import { DataExtractionStack } from "../lib/data-extraction-stack";
import { ExecuteOperationsStack } from "../lib/execute-operations-stack";

const config = getConfig();

const app = new cdk.App();

const commonProperties = {
  env: { account: config.AWS_ACCOUNT_ID, region: config.AWS_REGION },
  config,
};

const dataExtractionStack = new DataExtractionStack(
  app,
  "DataExtractionStack",
  commonProperties
);

const hftAppStack = new HftAppStack(app, "HftAppStack", {
  ...commonProperties,
  dataStream: dataExtractionStack.dataStream,
});

const balanceManagementStack = new BalanceManagementStack(
  app,
  "BalanceManagementStack",
  commonProperties
);

new ExecuteOperationsStack(app, "ExecuteOperationsStack", {
  ...commonProperties,
  operationsQueue: hftAppStack.operationsQueue,
  userBalanceTable: balanceManagementStack.userBalanceTable,
});
