import {
  DynamoDBBatchItemFailure,
  DynamoDBBatchResponse,
  DynamoDBStreamEvent,
} from "aws-lambda";
import { AppSyncHttpClient } from "../../services/AppSyncHttpClient";

const appSyncHttpClient = new AppSyncHttpClient(
  process.env.APP_SYNC_API_URL!,
  process.env.APP_SYNC_API_KEY!
);

export const handler = async (
  event: DynamoDBStreamEvent
): Promise<DynamoDBBatchResponse> => {
  const batchItemFailures: DynamoDBBatchItemFailure[] = [];
  let currentRecordSequenceNumber = "";

  const promises = event.Records.map(async (record) => {
    try {
      console.log("Processing record", JSON.stringify(record, null, 2));
      currentRecordSequenceNumber = record.dynamodb?.SequenceNumber ?? "";

      // // Your processing logic here
      // await appSyncHttpClient.publishInRealTime("operations", {
      //   userId: record.dynamodb?.NewImage?.userId.S,
      //   timestamp: record.dynamodb?.NewImage?.timestamp.S,
      //   action: record.dynamodb?.NewImage?.action.S,
      //   activeSymbol: record.dynamodb?.NewImage?.activeSymbol.S,
      //   quantity: record.dynamodb?.NewImage?.quantity.N,
      // });
    } catch (error) {
      console.error("Error processing record", JSON.stringify(record, null, 2));

      if (currentRecordSequenceNumber) {
        batchItemFailures.push({
          itemIdentifier: currentRecordSequenceNumber,
        });
      }
    }
  });

  await Promise.allSettled(promises);

  return { batchItemFailures };
};
