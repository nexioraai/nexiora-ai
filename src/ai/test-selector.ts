import { selectModules } from './module-selector'

console.log(
selectModules(
'Véhicules et Chauffeurs',
['vehicles','drivers','deliveries','customers']
)
)

console.log(
selectModules(
'Tout gérer',
['vehicles','drivers','deliveries','customers']
)
)
