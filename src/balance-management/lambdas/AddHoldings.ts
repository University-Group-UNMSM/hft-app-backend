import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";

const dynamoClient = new DynamoDBClient();

export type AddHoldingsPayload = {
  userId: string;
  activeSymbol: string;
  totalStocks: number;
};

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  try {
    if (!event.body) {
      return {
        isBase64Encoded: false,
        statusCode: 400,
        body: JSON.stringify({
          status: 400,
          success: false,
          message: "Body cannot be empty",
        }),
        headers: {
          "content-type": "application/json",
        },
      };
    }

    const payload: AddHoldingsPayload = JSON.parse(event.body);

    if (!payload.userId || !payload.totalStocks || !payload.activeSymbol) {
      return {
        isBase64Encoded: false,
        statusCode: 400,
        body: JSON.stringify({
          status: 400,
          success: false,
          message: "userId, activeSymbol and totalStocks are required",
        }),
        headers: {
          "content-type": "application/json",
        },
      };
    }

    // Add new holding
    await dynamoClient.send(
      new PutItemCommand({
        TableName: process.env.USER_BALANCE_TABLE_NAME,
        Item: marshall({
          userId: payload.userId,
          activeSymbol: payload.activeSymbol,
          totalStocks: payload.totalStocks,
          lastOperationTimestamp: new Date().toISOString(),
        }),
        ConditionExpression: "attribute_not_exists(activeSymbol)",
      })
    );

    return {
      isBase64Encoded: false,
      statusCode: 201,
      body: JSON.stringify({
        status: 201,
        success: true,
        message: "Hold added Successfully",
      }),
      headers: {
        "content-type": "application/json",
      },
    };
  } catch (error) {
    console.error(error);

    if ((error as Error).name === "ConditionalCheckFailedException") {
      return {
        isBase64Encoded: false,
        statusCode: 409,
        body: JSON.stringify({
          status: 409,
          success: false,
          message: "Symbol already exists",
        }),
        headers: {
          "content-type": "application/json",
        },
      };
    }

    return {
      isBase64Encoded: false,
      statusCode: 400,
      body: JSON.stringify({
        status: 500,
        success: false,
        message: "Something went wrong",
      }),
      headers: {
        "content-type": "application/json",
      },
    };
  }
};
