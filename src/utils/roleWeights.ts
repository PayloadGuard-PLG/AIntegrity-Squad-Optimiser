/**
* roleWeights.ts: Role-Specific Attribute Constraints
* Prevents non-essential skill gains based on player roles to maintain lean OVR.
*/
export const ROLE_CONSTRAINTS: Record<string, { essential: string[]; secondary: string[] }> = {
 ST: { 
   essential: ['FINISHING', 'SHOOTING', 'STRENGTH'], 
   secondary: ['SPEED', 'DRIBBLING', 'PASSING'] 
 },
 DC: { 
   essential: ['TACKLING', 'MARKING', 'STRENGTH'], 
   secondary: ['HEADING', 'POSITIONING', 'BRAVERY'] 
 },
 GK: { 
   essential: ['REFLEXES', 'AGILITY', 'COMMUNICATION'], 
   secondary: ['HANDLING', 'KICKING', 'PUNCHING'] 
 },
 MC: {
   essential: ['PASSING', 'DRIBBLING', 'CREATIVITY'],
   secondary: ['FITNESS', 'SPEED', 'MARKING']
 }
};

/**
* Validates if a skill gain is efficient for a specific role.
*/
export function isEssentialGain(role: string, skillName: string): boolean {
 const roleData = ROLE_CONSTRAINTS[role.toUpperCase()];
 if (!roleData) return true; // Default to allow if role not defined
 
 const normalizedSkill = skillName.toUpperCase();
 return roleData.essential.includes(normalizedSkill) || 
        roleData.secondary.includes(normalizedSkill);
}
