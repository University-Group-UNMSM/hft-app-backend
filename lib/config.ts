import * as dotenv from "dotenv";
import path = require("path");

dotenv.config({ path: path.resolve(__dirname, "../.env") });

export enum STAGE {
  DEV = "dev",
  TEST = "test",
  PROD = "prod",
}

export type ConfigProps = {
  STAGE: STAGE;
  AWS_REGION: string;
  AWS_ACCOUNT_ID: string;
  COINMARKETCAP_API_KEY: string;
  HTTP_API_ID: string;
  JWT_SECRET: string;
  SALT_ROUNDS: number;
};

export const getConfig = (): ConfigProps => {
  return {
    STAGE: (process.env.STAGE as STAGE) ?? STAGE.DEV,
    AWS_REGION: process.env.AWS_REGION ?? "",
    AWS_ACCOUNT_ID: process.env.AWS_ACCOUNT_ID ?? "us-east-1",
    COINMARKETCAP_API_KEY: process.env.COINMARKETCAP_API_KEY ?? "",
    HTTP_API_ID: process.env.HTTP_API_ID ?? "",
    JWT_SECRET: process.env.JWT_SECRET ?? "",
    SALT_ROUNDS: parseInt(process.env.SALT_ROUNDS ?? "10", 10),
  };
};
