import { SQSBatchItemFailure, SQSBatchResponse, SQSEvent } from "aws-lambda";

export type ProcessOperationWithBrokerRecord = {
  userId: string;
  activeSymbol: string;
  action: string;
};

export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  const itemFailures: SQSBatchItemFailure[] = [];

  for (const record of event.Records) {
    try {
      const payload: ProcessOperationWithBrokerRecord = JSON.parse(record.body);

      console.log("payload received -> ", payload);
    } catch (error) {
      itemFailures.push({ itemIdentifier: record.messageId });
      console.error(error);
    }
  }

  return {
    batchItemFailures: itemFailures,
  };
};
