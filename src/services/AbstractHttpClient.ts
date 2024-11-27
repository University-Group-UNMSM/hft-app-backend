import axios, { AxiosInstance } from "axios";
import { HttpClientConfig } from "./HttpClientConfig";

const API_GW_TIMEOUT_IN_MS = 30000;

export abstract class AbstractHttpClient {
  protected api: AxiosInstance;

  constructor({ baseUrl, timeout = API_GW_TIMEOUT_IN_MS }: HttpClientConfig) {
    this.api = axios.create({
      baseURL: baseUrl,
      timeout: timeout,
    });
  }
}
