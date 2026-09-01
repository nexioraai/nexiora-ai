// @deribfy/blocks — Smart Blocks v1 (D-023) : registre + contrats + composants.
export type {
  BlockA11yProps,
  Blocks,
  ButtonBlockProps,
  DetailHeaderBlockProps,
  EmptyStateBlockProps,
  FormBlockProps,
  FormBlockState,
  FormFieldSpec,
  HeaderBlockProps,
  ListBlockProps,
  ListBlockState,
  ListItemData,
} from "./contracts.ts";
export {
  blocks,
  ButtonBlock,
  DetailHeaderBlock,
  EmptyStateBlock,
  FormBlock,
  HeaderBlock,
  ListBlock,
} from "./components.tsx";
export {
  BLOCK_REGISTRY_VERSION,
  BLOCKS,
  type BlockDefinition,
  type EntityBinding,
  BLOCS_AFFORDANTS,
} from "./definitions.ts";
export {
  getBlock,
  listBlockIds,
  validateAirBlocks,
  type AirBlockSlice,
  type BlockDiagnostic,
} from "./registry.ts";
