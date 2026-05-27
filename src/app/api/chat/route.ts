Import { NextResponse } from 'next/server';

import Anthropic from '@anthropic-ai/sdk';



const anthropic = new Anthropic({

apiKey: process.env.ANTHROPIC_API_KEY,

});



export async function POST(req: Request) {

try {

const body = await req.json();

const message = body.message;



// Validation

if (!message || typeof message !== 'string') {

return NextResponse.json(

{ error: 'Invalid message input.' },

{ status: 400 }

);

}



// Protection longueur

if (message.length > 500) {

return NextResponse.json(

{ error: 'Message too long.' },

{ status: 400 }

);

}



const response = await anthropic.messages.create({

model: 'claude-3-haiku-20240307',

max_tokens: 1000,



system: `

You are Nexiora AI, an expert AI business generator.



IMPORTANT:

- Respond ONLY with valid JSON

- No markdown

- No explanations

- No code block



JSON format:

{

"name": "Business name",

"slogan": "Professional slogan",

"services": [

"Service 1",

"Service 2",

"Service 3"

],

"cta": "Call to action"

}

`,



messages: [

{

role: 'user',

content: `Create a business for: ${message}`,

},

],

});



const contentBlock = response.content[0];



if (!contentBlock || contentBlock.type !== 'text') {

throw new Error('Invalid AI response.');

}



const text = contentBlock.text.trim();



let parsed;



try {

parsed = JSON.parse(text);

} catch (parseError) {

console.error('JSON Parse Error:', parseError);



return NextResponse.json(

{

error: 'Invalid JSON returned by AI',

raw: text,

},

{ status: 500 }

);

}



return NextResponse.json(parsed);



} catch (error) {

console.error('API Error:', error);



return NextResponse.json(

{ error: 'Failed to generate business.' },

{ status: 500 }

);

}

} 

