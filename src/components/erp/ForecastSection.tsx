import ForecastCard from './forecasts/ForecastCard'

export default function ForecastSection() {
return (
<div style={{ marginTop: '40px' }}>

<h2
style={{
fontSize: '28px',
fontWeight: 'bold',
marginBottom: '20px'
}}
>
Predictive Analytics
</h2>

<div
style={{
display: 'grid',
gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))',
gap: '20px'
}}
>

<ForecastCard
title="Revenue Forecast"
forecast="+14.8%"
confidence="96%"
risk="Low"
/>

<ForecastCard
title="Cash Flow Forecast"
forecast="+8.2%"
confidence="94%"
risk="Low"
/>

<ForecastCard
title="Demand Forecast"
forecast="+21%"
confidence="91%"
risk="Medium"
/>

<ForecastCard
title="Inventory Forecast"
forecast="-12 Days Stock"
confidence="97%"
risk="High"
/>

</div>

</div>
)
}
