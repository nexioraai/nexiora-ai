export function selectModules(
message: string,
availableModules: string[]
): string[] {

const text =
message.toLowerCase()

if (
text.includes('tout')
) {
return availableModules
}

const selected: string[] = []

const aliases: Record<string,string> = {
vehicules: 'vehicles',
véhicules: 'vehicles',

chauffeurs: 'drivers',
conducteurs: 'drivers',

livraisons: 'deliveries',
livraison: 'deliveries',

clients: 'customers',
client: 'customers'
}

Object.entries(aliases)
.forEach(([label,module]) => {

if (
text.includes(label) &&
availableModules.includes(module)
) {
selected.push(module)
}

})

return [...new Set(selected)]
}
