import json
import boto3
import yfinance as yf
import os

# Inicializar el cliente de Kinesis
kinesis_client = boto3.client('kinesis', region_name='us-east-1')  # Cambia la región según sea necesario

# Nombre de la acción a consultar
stock = 'AAPL'  # Cambia este valor según la acción que quieras obtener
hardcoded_user_id = "f1c20422-47b5-4207-9c9c-479a0286e6d6"

def lambda_handler(event, context):
    # Obtener los datos de la acción
    ticker = yf.Ticker(stock)
    stock_data = ticker.history(period='1d', interval='1h')

    # Obtener solo la última fila de datos (el dato más reciente)
    last_row = stock_data.tail(1).copy()
    last_row_data = {
        'userId': hardcoded_user_id,
        'name': stock,
        'open': float(last_row['Open'].values[0]),
        'high': float(last_row['High'].values[0]),
        'low': float(last_row['Low'].values[0]),
        'close': float(last_row['Close'].values[0]),
        'volume': int(last_row['Volume'].values[0]),
        'datetime': last_row.index[0].isoformat()  # La fecha y hora del dato
    }

    # Enviar los datos al stream de Kinesis
    kinesis_stream_name = os.environ['KINESIS_STREAM_NAME']  # Nombre del stream desde las variables de entorno
    kinesis_client.put_record(
        StreamName=kinesis_stream_name,
        Data=json.dumps(last_row_data),
        PartitionKey=stock  # Usar el nombre de la acción como clave de partición
    )

    print(f"Datos enviados a Kinesis para {stock}")

    return {
        'statusCode': 200,
        'body': json.dumps({'message': 'Datos enviados a Kinesis exitosamente'})
    }
