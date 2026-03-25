import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

async function run() {
  const transport = new SSEClientTransport(new URL("http://localhost:3000/sse"));
  const client = new Client({ name: "test-client", version: "1.0.0" }, { capabilities: {} });

  client.onerror = (err) => console.error("Client error:", err);

  try {
    await client.connect(transport);
    console.log("Connected successfully!");
    
    const tools = await client.listTools();
    console.log("Tools:", tools);
    
    await client.close();
  } catch (err) {
    console.error("Connection failed:", err);
  }
}

run();
