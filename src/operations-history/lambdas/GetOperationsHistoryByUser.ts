import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
  SQSEvent,
} from "aws-lambda";

const dynamoClient = new DynamoDBClient();

type GetOperationsHistoryByUserPayload = APIGatewayProxyEventV2 & {
  pathParameters: {
    userId: string;
  };
};

export const handler = async (
  event: GetOperationsHistoryByUserPayload
): Promise<APIGatewayProxyResultV2> => {
  try {
    const userId = event.pathParameters.userId;

    const records = await dynamoClient.send(
      new QueryCommand({
        TableName: process.env.OPERATIONS_HISTORY_TABLE_NAME,
        KeyConditionExpression: "userId = :userId",
        ExpressionAttributeValues: {
          ":userId": { S: userId },
        },
      })
    );

    const items = records.Items?.map((item) => unmarshall(item));

    return {
      statusCode: 200,
      body: JSON.stringify({
        code: 200,
        data: items,
      }),
    };
  } catch (error) {
    console.error(error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        code: 500,
        message: "Something went wrong",
      }),
    };
  }
};
