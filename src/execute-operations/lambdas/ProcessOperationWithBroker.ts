import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { marshall } from "@aws-sdk/util-dynamodb";
import { SQSBatchItemFailure, SQSBatchResponse, SQSEvent } from "aws-lambda";

const DEFAULT_NUMER_OF_STOCKS_TO_OPERATE_WITH = 10;

export type ProcessOperationWithBrokerRecord = {
  userId: string;
  activeSymbol: string;
  action: "sell" | "buy";
};

type Order = ProcessOperationWithBrokerRecord & {
  quantity: number;
};

export type OperationsHistoryRecord = Order & {
  timestamp: string;
};

const dynamoClient = new DynamoDBClient();
const sqsClient = new SQSClient();

export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  const itemFailures: SQSBatchItemFailure[] = [];

  for (const record of event.Records) {
    try {
      const payload: ProcessOperationWithBrokerRecord = JSON.parse(record.body);
      console.log("payload received -> ", payload);

      const user = await dynamoClient.send(
        new GetItemCommand({
          TableName: process.env.USER_BALANCE_TABLE_NAME,
          Key: marshall({
            userId: payload.userId,
            aciveSymbol: payload.activeSymbol,
          }),
        })
      );

      if (!user.Item) {
        throw new Error("User not found: " + payload.userId);
      }

      const currentStocks = user.Item.totalStocks
        ? Number(user.Item.totalStocks.N)
        : 0;

      if (payload.action !== "sell" && payload.action !== "buy") {
        throw new Error("Invalid action");
      }

      if (payload.action === "buy") {
        mockInteractiveBrokersApiResponse({
          action: payload.action,
          activeSymbol: payload.activeSymbol,
          quantity: DEFAULT_NUMER_OF_STOCKS_TO_OPERATE_WITH,
          userId: payload.userId,
        });

        await dynamoClient.send(
          new PutItemCommand({
            TableName: process.env.USER_BALANCE_TABLE_NAME,
            Item: marshall({
              userId: payload.userId,
              activeSymbol: payload.activeSymbol,
              totalStocks: (
                currentStocks + DEFAULT_NUMER_OF_STOCKS_TO_OPERATE_WITH
              ).toString(),
            }),
          })
        );
      } else if (payload.action === "sell") {
        if (currentStocks < DEFAULT_NUMER_OF_STOCKS_TO_OPERATE_WITH) {
          throw new Error("Not enough stocks to sell");
        }

        mockInteractiveBrokersApiResponse({
          action: payload.action,
          activeSymbol: payload.activeSymbol,
          quantity: DEFAULT_NUMER_OF_STOCKS_TO_OPERATE_WITH,
          userId: payload.userId,
        });

        await dynamoClient.send(
          new PutItemCommand({
            TableName: process.env.USER_BALANCE_TABLE_NAME,
            Item: marshall({
              userId: payload.userId,
              activeSymbol: payload.activeSymbol,
              totalStocks: (
                currentStocks - DEFAULT_NUMER_OF_STOCKS_TO_OPERATE_WITH
              ).toString(),
            }),
          })
        );
      }

      await sqsClient.send(
        new SendMessageCommand({
          QueueUrl: process.env.OPERATIONS_HISTORY_QUEUE_URL,
          MessageBody: JSON.stringify({
            action: payload.action,
            activeSymbol: payload.activeSymbol,
            userId: payload.userId,
            quantity: DEFAULT_NUMER_OF_STOCKS_TO_OPERATE_WITH,
            timestamp: new Date().toISOString(),
          } satisfies OperationsHistoryRecord),
        })
      );
    } catch (error) {
      itemFailures.push({ itemIdentifier: record.messageId });
      console.error(error);
    }
  }

  return {
    batchItemFailures: itemFailures,
  };
};

const mockInteractiveBrokersApiResponse = (order: Order) => {
  return {
    status: "success",
    orderId: Math.random().toString(36).substring(2, 9), // Mock OrderId
    message: `Order for ${order.quantity} shares of ${order.activeSymbol} to ${order.action} has been processed.`,
  };
};
