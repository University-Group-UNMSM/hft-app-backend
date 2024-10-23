import axios from "axios";
import { KinesisClient, PutRecordCommand } from "@aws-sdk/client-kinesis";

const hardcodedUserId = "f1c20422-47b5-4207-9c9c-479a0286e6d6";

export type CoinMarketCapResponse = {
  data: Array<{
    name: string;
    symbol: string;
    quote: {
      USD: {
        price: number;
        percent_change_24h: number;
        market_cap: number;
      };
    };
  }>;
};

// Crear una instancia del cliente Kinesis
const kinesisClient = new KinesisClient();

export const handler = async () => {
  try {
    const currency = "Bitcoin"; // Puedes establecer la moneda que deseas consultar

    const url =
      "https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest";

    const parameters = {
      start: "1",
      limit: "5000",
      convert: "USD",
    };

    const headers = {
      Accepts: "application/json",
      "X-CMC_PRO_API_KEY": process.env.COINMARKETCAP_API_KEY, // La clave API desde las variables de entorno
    };

    const response = await axios.get<CoinMarketCapResponse>(url, {
      headers,
      params: parameters,
    });

    const data = response.data;

    // Buscar la moneda por nombre
    const crypto = data.data.find(
      (c) => c.name.toLowerCase() === currency.toLowerCase()
    );

    if (crypto) {
      const cryptoData = {
        userId: hardcodedUserId,
        name: crypto.symbol,
        price: crypto.quote.USD.price,
        variation24h: crypto.quote.USD.percent_change_24h,
        marketCap: crypto.quote.USD.market_cap,
      };

      // Enviar los datos al stream de Kinesis
      const kinesisParams = {
        Data: Buffer.from(JSON.stringify(cryptoData)),
        PartitionKey: currency,
        StreamName: process.env.KINESIS_STREAM_NAME, // El nombre del stream desde las variables de entorno
      };

      const command = new PutRecordCommand(kinesisParams);
      await kinesisClient.send(command);

      return {
        statusCode: 200,
        body: JSON.stringify({
          message: `Datos de ${crypto.name} enviados a Kinesis`,
          cryptoData,
        }),
      };
    } else {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: "Moneda no encontrada" }),
      };
    }
  } catch (error) {
    console.error("Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Error al obtener la información o enviar a Kinesis",
        error: (error as Error).message,
      }),
    };
  }
};
