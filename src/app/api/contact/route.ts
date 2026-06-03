import { NextResponse } from 'next/server';

export async function POST(req: Request) {

try {

const body = await req.json();

const {
name,
email,
subject,
message,
} = body;

if (
!name ||
!email ||
!subject ||
!message
) {

return NextResponse.json(
{
success: false,
error: 'Missing fields',
},
{
status: 400,
}
);
}

console.log({
name,
email,
subject,
message,
});

return NextResponse.json({
success: true,
message: 'Message sent successfully',
});

} catch (error: any) {

return NextResponse.json(
{
success: false,
error: error.message,
},
{
status: 500,
}
);
}
}