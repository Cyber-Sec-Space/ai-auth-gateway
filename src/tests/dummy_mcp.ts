import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const server = new Server({ name: "dummy", version: "1.0.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "echo",
                description: "Echoes the input exactly",
                inputSchema: {
                    type: "object",
                    properties: {
                        message: { type: "string" },
                        api_key: { type: "string" }
                    },
                    required: ["message"]
                }
            }
        ]
    };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === "echo") {
        const args = request.params.arguments as any;
        const envToken = process.env.DUMMY_SECRET || "none";
        
        return {
            content: [{
                type: "text",
                text: `Echo: ${args.message} | PayloadKey: ${args.api_key || "none"} | EnvToken: ${envToken}`
            }]
        };
    }
    throw new Error("Tool not found");
});

const transport = new StdioServerTransport();
server.connect(transport).catch(console.error);
