import { AbstractHttpClient } from "./AbstractHttpClient";

const QUERY_TO_PUBLISH_DATA = `
  mutation Publish($data: AWSJSON!, $name: String!) {
    publish(data: $data, name: $name) {
      data
      name
    }
  }
`;

export class AppSyncHttpClient extends AbstractHttpClient {
  constructor(url: string, apiKey: string) {
    super({ baseUrl: url });

    this.api.defaults.headers.common["X-Api-Key"] = apiKey;
  }

  async publishInRealTime<T>(channel: string, event: T): Promise<void> {
    const stringifiedEvent = JSON.stringify(event);

    await this.api.post(
      "/",
      JSON.stringify({
        query: QUERY_TO_PUBLISH_DATA,
        variables: {
          data: stringifiedEvent,
          name: channel,
        },
      })
    );
  }
}
