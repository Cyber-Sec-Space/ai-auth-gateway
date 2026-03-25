import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function runTest() {
  console.log("Starting integration test client...");
  const client = new Client({ name: "test-client", version: "1.0.0" }, { capabilities: {} });
  
  const transport = new StdioClientTransport({
    command: "node",
    args: ["build/index.js"]
  });

  await client.connect(transport);
  console.log("✅ Connected to proxy server.");

  const tools = await client.listTools();
  console.log("\n🔍 Available tools from proxy:");
  console.log(JSON.stringify(tools.tools.map(t => t.name), null, 2));

  for (const tool of tools.tools) {
      console.log(`\n🚀 Calling tool: ${tool.name}`);
      const result = await client.callTool({
          name: tool.name,
          arguments: { message: "Hello Proxy!" }
      });
      console.log(`📄 Call result for ${tool.name}:`);
      console.log((result as any).content[0]);
  }

  console.log("\n✅ Integration test completed successfully.");
  process.exit(0);
}

runTest().catch(e => {
  console.error(e);
  process.exit(1);
});
