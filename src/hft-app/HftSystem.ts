import {
  KinesisStreamEvent,
  Context,
  KinesisStreamBatchResponse,
  KinesisStreamBatchItemFailure,
  KinesisStreamRecordPayload,
} from "aws-lambda";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { randomInt } from "crypto";

// Configuración de SQS y FIFO Queue
const sqsClient = new SQSClient();

// Lambda Handler para procesar el stream de Kinesis
export const handler = async (
  event: KinesisStreamEvent,
  context: Context
): Promise<KinesisStreamBatchResponse> => {
  const itemFailures: KinesisStreamBatchItemFailure[] = [];

  // Procesar cada registro del stream de Kinesis
  for (const record of event.Records) {
    try {
      // Decodificar el mensaje de Kinesis
      const payload = await getRecordDataAsync(record.kinesis);

      const data: {
        userId: string;
        name: string;
        price?: number;
        variation24h?: number;
        marketCap?: number;
      } = JSON.parse(payload);

      const { userId, name } = data;

      console.log(`Processing for user ${userId}, active: ${name}`);

      // Simulamos las predicciones
      const { svmPrediction, lstmPrediction, finalPrediction } =
        simulatePredictions();
      console.log(
        `Predictions: SVM = ${svmPrediction}, LSTM = ${lstmPrediction}, Final = ${finalPrediction}`
      );

      // Enviar la orden correspondiente a la cola SQS
      if (finalPrediction !== 0) {
        // Solo enviamos órdenes de compra o venta
        await sendOrderToSQS(userId, name, finalPrediction);
      }
    } catch (error) {
      itemFailures.push({
        itemIdentifier: record.kinesis.sequenceNumber,
      });
      console.error(error);
    }
  }

  return {
    batchItemFailures: itemFailures,
  };
};

// Función para simular las predicciones de SVM y LSTM con valores aleatorios
function simulatePredictions() {
  // Simulamos las predicciones de SVM y LSTM con números aleatorios (-1: venta, 0: mantener, 1: compra)
  const svmPrediction = randomInt(-1, 2);
  const lstmPrediction = randomInt(-1, 2);

  // Combinamos las predicciones: si ambos modelos predicen lo mismo, lo usamos. Si no, elegimos mantener (0)
  const finalPrediction = svmPrediction === lstmPrediction ? svmPrediction : 0;

  return {
    svmPrediction,
    lstmPrediction,
    finalPrediction,
  };
}

// Función para enviar una orden a SQS FIFO
async function sendOrderToSQS(
  userId: string,
  activeSymbol: string,
  prediction: number
) {
  let action = "";

  // Definimos la acción en función de la predicción combinada
  if (prediction === 1) {
    action = "buy";
  } else if (prediction === -1) {
    action = "sell";
  } else {
    action = "hold"; // Mantener, si no hay consenso
  }

  // Preparamos el mensaje de la orden
  const messageBody = JSON.stringify({
    userId,
    activeSymbol,
    action,
  });

  // Enviamos el mensaje a la cola FIFO con un identificador único
  const command = new SendMessageCommand({
    QueueUrl: process.env.EXECUTE_OPERATIONS_QUEUE_URL,
    MessageBody: messageBody,
    MessageGroupId: userId, // Usamos userId como MessageGroupId para asegurarnos de que las órdenes por usuario se procesen en orden
    MessageDeduplicationId: `${userId}-${Date.now()}`, // Para evitar duplicados
  });

  // Enviamos el mensaje a SQS
  await sqsClient.send(command);
  console.log(`Order sent to SQS: ${messageBody}`);
}

const getRecordDataAsync = async (payload: KinesisStreamRecordPayload) => {
  const data = Buffer.from(payload.data, "base64").toString("utf-8");
  await Promise.resolve(1);

  return data;
};
