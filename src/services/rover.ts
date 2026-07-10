import { db } from '../database/db';

export async function verifyUserRoblox(discordId: string, guildId: string, memberRoles: string[]): Promise<{ verified: boolean; message?: string }> {
    const settings = await db.settings.findUnique({ where: { id: 'global' } });
    
    // 1. Check if RoVer is disabled in settings
    if (!settings?.roverEnabled) return { verified: true };

    // 2. Check Staff Bypass
    if (settings.seniorModRoleId && memberRoles.includes(settings.seniorModRoleId)) {
        return { verified: true, message: 'Staff Bypass Authorized.' };
    }

    // 3. API Key check
    if (!settings.roverApiKey) return { verified: false, message: 'RoVer API Key is missing in /settings.' };

    try {
        const response = await fetch(`https://registry.rover.link/api/guilds/${guildId}/discord-to-roblox/${discordId}`, {
            headers: { 'Authorization': `Bearer ${settings.roverApiKey}` }
        });

        if (response.status === 200) {
            return { verified: true };
        } else {
            return { verified: false, message: 'You must link your Roblox account via RoVer to play in OCL.' };
        }
    } catch (error) {
        return { verified: false, message: 'Error communicating with RoVer API. Try again later.' };
    }
}
