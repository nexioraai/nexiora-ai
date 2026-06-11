export function normalizeBlueprint(data: any) {
  const modules = data.modules || []

  return {
    // On preserve TOUT le blueprint genere par l'IA :
    // name, dashboard, reports, automations, agents, workflows, etc.
    ...data,

    // On garde modules tel quel
    modules,

    // models : version normalisee des champs (pour la couche donnees)
    models: modules.map((m: any) => ({
      name: m.name,
      fields: (m.fields || []).map((field: any) => ({
        name: field.name || field,
        type: field.type || 'string',
        required: field.required || false,
        unique: field.unique || false,
      })),
    })),

    // relations : agregees depuis tous les modules
    relations: modules.flatMap((m: any) => m.relations || []),
  }
}
