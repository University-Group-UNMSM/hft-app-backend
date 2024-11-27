import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { compare } from "bcryptjs";
import { sign } from "jsonwebtoken";

const dynamoClient = new DynamoDBClient();

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  try {
    const { email, password } = JSON.parse(event.body!);

    if (!email || !password) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Missing required fields" }),
      };
    }

    const user = await dynamoClient.send(
      new GetItemCommand({
        TableName: process.env.USERS_TABLE_NAME!,
        Key: marshall({ email }),
      })
    );

    if (!user.Item) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "User not found" }),
      };
    }

    const userItem = unmarshall(user.Item);

    const passwordsMatch = await compare(password, userItem.password);

    if (!passwordsMatch) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Invalid password" }),
      };
    }

    const token = sign(
      { email: userItem.email, userId: userItem.userId },
      process.env.JWT_SECRET!
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ token }),
    };
  } catch (error) {
    console.error("Error logging in user", error);

    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Internal server error" }),
    };
  }
};
