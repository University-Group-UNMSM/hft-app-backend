import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { SQSBatchItemFailure, SQSBatchResponse, SQSEvent } from "aws-lambda";
import { OperationsHistoryRecord } from "../../execute-operations/lambdas/ProcessOperationWithBroker";
import { marshall } from "@aws-sdk/util-dynamodb";

const dynamoClient = new DynamoDBClient();

export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  const itemFailures: SQSBatchItemFailure[] = [];

  for (const record of event.Records) {
    try {
      const payload: OperationsHistoryRecord = JSON.parse(record.body);
      console.log("payload received -> ", payload);

      await dynamoClient.send(
        new PutItemCommand({
          TableName: process.env.OPERATIONS_HISTORY_TABLE_NAME,
          Item: marshall({
            userId: payload.userId, // PK
            timestamp: payload.timestamp, // SK
            action: payload.action,
            activeSymbol: payload.activeSymbol,
            quantity: payload.quantity,
          }),
        })
      );
    } catch (error) {
      console.error(error);
      itemFailures.push({
        itemIdentifier: record.messageId,
      });
    }
  }

  return {
    batchItemFailures: itemFailures,
  };
};
