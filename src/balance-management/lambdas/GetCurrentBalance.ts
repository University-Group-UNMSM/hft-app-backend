import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { decode } from "jsonwebtoken";

const dynamoClient = new DynamoDBClient();

export type UserBalanceItem = {
  activeSymbol: string;
  availableBalance: number;
  totalStocks: number;
  lastOperationTimestamp: string;
};

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  try {
    const authHeader = event.headers["authorization"];

    if (!authHeader) {
      return {
        statusCode: 401,
        body: JSON.stringify({
          code: 401,
          message: "Unauthorized",
        }),
      };
    }

    const token = authHeader.split(" ")[1];
    const decodedToken = decode(token) as { email: string; userId: string };

    // Consultar el balance disponible
    const cashQuery = await dynamoClient.send(
      new QueryCommand({
        TableName: process.env.USER_BALANCE_TABLE_NAME,
        KeyConditionExpression: "userId = :userId",
        ExpressionAttributeValues: {
          ":userId": {
            S: decodedToken.userId,
          },
        },
      })
    );

    const userBalance = cashQuery.Items;

    if (!userBalance?.length) {
      return {
        isBase64Encoded: false,
        statusCode: 404,
        body: JSON.stringify({
          status: 404,
          success: false,
          message: "Usuario no encontrado o sin balance disponible",
        }),
        headers: {
          "content-type": "application/json",
        },
      };
    }

    // Variables para almacenar balance y holdings
    let availableCash: number | null = null;
    const holdings: { [key: string]: number } = {};

    // Iterar sobre los resultados para separar balance y holdings
    userBalance.forEach((item) => {
      const data = unmarshall(item) as UserBalanceItem;

      if (data.activeSymbol === "CASH") {
        availableCash = data.availableBalance;
      } else {
        holdings[data.activeSymbol] = data.totalStocks;
      }
    });

    if (availableCash === null) {
      return {
        isBase64Encoded: false,
        statusCode: 404,
        body: JSON.stringify({
          status: 404,
          success: false,
          message: "User hasn`t balance",
        }),
        headers: {
          "content-type": "application/json",
        },
      };
    }

    return {
      isBase64Encoded: false,
      statusCode: 200,
      body: JSON.stringify({
        status: 200,
        success: true,
        message: "Success",
        data: {
          availableBalance: availableCash,
          holdings,
        },
      }),
      headers: {
        "content-type": "application/json",
      },
    };
  } catch (error) {
    console.error(error);

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
