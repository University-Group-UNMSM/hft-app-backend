import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { hash } from "bcryptjs";
import { randomUUID } from "crypto";

const dynamoClient = new DynamoDBClient();

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  try {
    const { name, email, password } = JSON.parse(event.body!);

    if (!name || !email || !password) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Missing required fields" }),
      };
    }

    const hashedPassword = await hash(password, +process.env.SALT_ROUNDS!);

    await dynamoClient.send(
      new PutItemCommand({
        TableName: process.env.USERS_TABLE_NAME!,
        Item: marshall({
          email,
          userId: randomUUID(),
          name,
          password: hashedPassword,
        }),
        ConditionExpression: "attribute_not_exists(email)",
      })
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "User registered successfully",
      }),
    };
  } catch (error) {
    console.error("Error registering user", error);

    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Internal server error" }),
    };
  }
};
