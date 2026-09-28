export const itemStatuses = [
  'Available',
  'In Use',
  'Reserved',
  'Broken',
  'Loaned',
  'Sold',
  'Archived',
] as const;
export const projectStatuses = [
  'Idea',
  'Planning',
  'Ready',
  'In Progress',
  'Complete',
  'Abandoned',
] as const;
export const conditions = ['New', 'Like New', 'Good', 'Fair', 'For Parts'] as const;
export const defaultCategories = [
  'CPU',
  'GPU',
  'RAM',
  'Motherboard',
  'SSD',
  'HDD',
  'Raspberry Pi',
  'Microcontroller',
  'Networking',
  'Router',
  'Switch',
  'Monitor',
  'Keyboard',
  'Mouse',
  'Audio',
  'Cable',
  'Adapter',
  'Power Supply',
  'Development Board',
  'Tool',
  'Miscellaneous',
];
export interface User {
  id: string;
  name: string;
  email: string;
}
export interface Location {
  id: string;
  name: string;
  description: string;
  itemCount: number;
}
export interface Assignment {
  id: string;
  projectId: string;
  projectName: string;
  itemId: string;
  itemName: string;
  quantity: number;
  projectStatus: (typeof projectStatuses)[number];
}
export interface InventoryItem {
  id: string;
  name: string;
  manufacturer: string;
  model: string;
  category: string;
  quantity: number;
  condition: (typeof conditions)[number];
  status: (typeof itemStatuses)[number];
  locationId: string | null;
  locationName: string | null;
  notes: string;
  purchasePriceCents: number | null;
  purchaseDate: string | null;
  estimatedValueCents: number | null;
  serialNumber: string;
  tags: string[];
  imageUrl: string;
  createdAt: string;
  updatedAt: string;
  assignments: Assignment[];
  availableQuantity: number;
}
export interface Requirement {
  id: string;
  name: string;
  categories: string[];
  tags: string[];
  quantity: number;
  optional: boolean;
  estimatedUnitCostCents: number;
}
export interface Project {
  id: string;
  name: string;
  description: string;
  status: (typeof projectStatuses)[number];
  notes: string;
  estimatedCostCents: number | null;
  createdAt: string;
  requirements: Requirement[];
  assignments: Assignment[];
}
export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  difficulty: string;
  duration: string;
  icon: string;
  accent: string;
  requirements: Requirement[];
  caveat: string;
}
export interface RequirementMatch {
  requirement: Requirement;
  matched: { itemId: string; name: string; quantity: number }[];
  missingQuantity: number;
}
export interface Recommendation {
  template: ProjectTemplate;
  readiness: number;
  status: 'Ready to Build' | 'Almost Ready' | 'Missing Hardware';
  required: RequirementMatch[];
  optional: RequirementMatch[];
  missingCount: number;
  additionalCostCents: number;
}
export interface Dashboard {
  totalUnits: number;
  availableUnits: number;
  assignedUnits: number;
  totalValueCents: number;
  activeProjects: number;
  categories: { name: string; count: number }[];
  statuses: { name: string; count: number }[];
  recent: InventoryItem[];
  readyCount: number;
}
