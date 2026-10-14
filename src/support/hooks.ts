import { Before, After, BeforeAll, AfterAll, setDefaultTimeout } from "@cucumber/cucumber";
import { MockActivityRankingApi } from "../mock/mockActivityRankingApi";
import { openMeteoStub } from "../stubs/openMeteoStub";
import type { ApiWorld } from "./world";

setDefaultTimeout(20_000);

export const stubPort = (): number => Number(process.env.OPEN_METEO_STUB_PORT ?? 4010);

BeforeAll(async () => {
  await openMeteoStub.start(stubPort());
});

let mockApi: MockActivityRankingApi | undefined;
let mockApiUrl: string | undefined;

AfterAll(async () => {
  await mockApi?.stop();
  await openMeteoStub.stop();
});

// Must be declared before the generic Before so the API context is created with the mock URL.
Before({ tags: "@mock" }, async function (this: ApiWorld) {
  if (!mockApi) {
    mockApi = new MockActivityRankingApi(`http://127.0.0.1:${openMeteoStub.port}`);
    mockApiUrl = await mockApi.start();
  }
  this.baseUrl = mockApiUrl;
});

Before(async function (this: ApiWorld) {
  openMeteoStub.reset();
  await this.init();
});

After(async function (this: ApiWorld) {
  await this.dispose();
});
