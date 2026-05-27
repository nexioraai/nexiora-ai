import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';

const client = new Anthropic({
apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(request: NextRequest) {
const { message } = await request.json();

const response = await client.messages.create({
model: 'claude-haiku-4-5',
max_tokens: 500,
messages: [{ role: 'user', content: message }],
});

return NextResponse.json({
reply: response.content[0].type === 'text' ? response.content[0].text : ''
});
}
