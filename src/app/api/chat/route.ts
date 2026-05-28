Export async function POST() {
  return Response.json({
    name: 'Toyota Parts Hub',
    slogan: 'Original parts delivered fast.',
    services: [
      'Engine Parts',
      'Brake Systems',
      'Truck Components'
    ],
    cta: 'Get a Quote'
  });
}