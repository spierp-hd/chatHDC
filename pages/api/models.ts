import { OPENAI_API_HOST, OPENAI_API_TYPE, OPENAI_API_VERSION, OPENAI_ORGANIZATION } from '@/utils/app/const';
import { OpenAIModel, OpenAIModelID, OpenAIModels } from '@/types/openai';

export const config = {
  runtime: 'edge',
};

console.log("API Key:", process.env.AZURE_OPENAI_API_KEY);
console.log("API Host:", process.env.OPENAI_API_HOST);
console.log("API Type:", process.env.OPENAI_API_TYPE);
console.log("API Version:", process.env.OPENAI_API_VERSION);

const handler = async (req: Request): Promise<Response> => {
  try {
    console.log("[API] /api/models endpoint accessed");

    const { key } = (await req.json()) as {
      key: string;
    };

    let url = `${OPENAI_API_HOST}/v1/models`;
    if (OPENAI_API_TYPE === 'azure') {
      url = `${OPENAI_API_HOST}/openai/models?api-version=${OPENAI_API_VERSION}`;
    }

    console.log("[API] Fetching data from:", url);

    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...(OPENAI_API_TYPE === 'openai' && {
          Authorization: `Bearer ${key ? key : process.env.AZURE_OPENAI_API_KEY}`
        }),
        ...(OPENAI_API_TYPE === 'azure' && {
          'api-key': `${key ? key : process.env.AZURE_OPENAI_API_KEY}`
        }),
        ...((OPENAI_API_TYPE === 'openai' && OPENAI_ORGANIZATION) && {
          'OpenAI-Organization': OPENAI_ORGANIZATION,
        }),
      },
    });

    console.log("[API] Response received with status:", response.status);

    if (response.status === 401) {
      console.error("[API] Unauthorized access detected");
      return new Response(response.body, {
        status: 500,
        headers: response.headers,
      });
    } else if (response.status !== 200) {
      console.error(
        `OpenAI API returned an error ${
          response.status
        }: ${await response.text()}`,
      );
      throw new Error('OpenAI API returned an error');
    }

    const json = await response.json();

    const models: OpenAIModel[] = json.data
      .map((model: any) => {
        const model_name = (OPENAI_API_TYPE === 'azure') ? model.model : model.id;
        for (const [key, value] of Object.entries(OpenAIModelID)) {
          if (value === model_name) {
            return {
              id: model.id,
              name: OpenAIModels[value].name,
            };
          }
        }
      })
      .filter(Boolean);

    console.log("[API] Models data processed successfully:", models);

    return new Response(JSON.stringify(models), { status: 200 });
  } catch (error) {
    console.error("[API] Error in /api/models:", error);
    return new Response('Error', { status: 500 });
  }
};

export default handler;
