import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ColorResolvable, GuildMember } from 'discord.js';
import { db } from '../../database/db';
import { verifyUserRoblox } from '../../services/rover';
import { logger } from '../../utils/logger';

export const clanCommand = {
    data: new SlashCommandBuilder()
        .setName('clan')
        .setDescription('Complete Clan and Franchise management')
        .addSubcommand(s => s.setName('list').setDescription('View all registered clans'))
        .addSubcommand(s => s.setName('roster').setDescription('View a clan roster').addStringOption(o => o.setName('clan').setDescription('Exact clan name').setRequired(true).setAutocomplete(true)))
        .addSubcommand(s => s.setName('request').setDescription('Request to join a clan').addStringOption(o => o.setName('clan').setDescription('Target clan').setRequired(true).setAutocomplete(true)))
        .addSubcommand(s => s.setName('requests').setDescription('View pending applications to your clan'))
        .addSubcommand(s => s.setName('accept').setDescription('Accept a player into your clan').addUserOption(o => o.setName('user').setDescription('Applicant to accept').setRequired(true)))
        .addSubcommand(s => s.setName('deny').setDescription('Deny a player').addUserOption(o => o.setName('user').setDescription('Applicant to deny').setRequired(true)))
        .addSubcommand(s => s.setName('release').setDescription('Kick a member from your clan').addUserOption(o => o.setName('user').setDescription('Member to kick').setRequired(true)))
        .addSubcommand(s => s.setName('promote').setDescription('Promote a member to GM').addUserOption(o => o.setName('user').setDescription('Member to promote').setRequired(true)))
        .addSubcommand(s => s.setName('demote').setDescription('Demote a GM to Member').addUserOption(o => o.setName('user').setDescription('GM to demote').setRequired(true)))
        .addSubcommand(s => s.setName('transfer').setDescription('Transfer FO ownership').addUserOption(o => o.setName('user').setDescription('New Franchise Owner').setRequired(true)))
        .addSubcommand(s => s.setName('add').setDescription('Add a new clan (Creates Role)')
            .addStringOption(o => o.setName('name').setDescription('Clan Name').setRequired(true))
            .addUserOption(o => o.setName('franchise_owner').setDescription('The FO of this clan').setRequired(true))
            .addAttachmentOption(o => o.setName('logo').setDescription('Clan Logo image').setRequired(false))
            .addStringOption(o => o.setName('color').setDescription('Role Hex (e.g. #337def) or Color Word').setRequired(false))
            .addAttachmentOption(o => o.setName('role_icon').setDescription('Custom Role Icon (Needs Boost Lvl 2)').setRequired(false)))
        .addSubcommand(s => s.setName('disband').setDescription('Disband a clan').addStringOption(o => o.setName('clan').setDescription('Exact clan name').setRequired(true).setAutocomplete(true)).addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true)))
        .addSubcommand(s => s.setName('message').setDescription('Message a clan FO').addStringOption(o => o.setName('clan').setDescription('Target clan').setRequired(true).setAutocomplete(true)).addStringOption(o => o.setName('message').setDescription('Message to send').setRequired(true))),

    async execute(interaction: ChatInputCommandInteraction) {
        const sub = interaction.options.getSubcommand();
        await interaction.deferReply({ ephemeral: !['roster', 'list'].includes(sub) });

        try {
            const executorUser = await db.user.upsert({ where: { id: interaction.user.id }, update: {}, create: { id: interaction.user.id }, include: { clan: true } });
            
            if (sub === 'list') {
                const clans = await db.clan.findMany({ include: { _count: { select: { members: true } } } });
                const embed = new EmbedBuilder().setTitle('🛡️ OCL Registered Clans').setDescription(clans.length ? clans.map(c => `**${c.name}** — FO: <@${c.ownerId}> | Members: ${c._count.members}`).join('\n') : 'No clans registered.').setColor('#337def').setThumbnail('https://i.imgur.com/f5LGesj.png');
                return interaction.editReply({ embeds: [embed] });
            }

            if (sub === 'roster') {
                const clan = await db.clan.findUnique({ where: { name: interaction.options.getString('clan', true) }, include: { members: true } });
                if (!clan) return interaction.editReply('❌ Clan not found.');
                
                let embedColor: ColorResolvable = '#337def';
                if (clan.roleId) {
                    const role = interaction.guild?.roles.cache.get(clan.roleId) || await interaction.guild?.roles.fetch(clan.roleId).catch(() => null);
                    if (role && role.hexColor !== '#000000') embedColor = role.hexColor as ColorResolvable;
                }

                const gms = clan.members.filter(m => m.clanRank === 'GM');
                const members = clan.members.filter(m => m.clanRank === 'MEMBER' && m.id !== clan.ownerId);
                const embed = new EmbedBuilder()
                    .setTitle(`🛡️ ${clan.name} Roster`)
                    .setColor(embedColor)
                    .setDescription(`**Franchise Owner**\n• <@${clan.ownerId}>\n\n**General Managers (${gms.length}/3)**\n${gms.length ? gms.map(m => `• <@${m.id}>`).join('\n') : 'None'}\n\n**Members (${members.length})**\n${members.length ? members.map(m => `• <@${m.id}>`).join('\n') : '*None*'}`)
                    .setFooter({ text: `Total Members: ${clan.members.length}` });
                
                if (clan.logo) embed.setThumbnail(clan.logo);
                return interaction.editReply({ content: '', embeds: [embed] });
            }

            if (sub === 'request') {
                if (executorUser.clanId) return interaction.editReply('❌ You are already in a clan.');
                const clan = await db.clan.findUnique({ where: { name: interaction.options.getString('clan', true) } });
                if (!clan) return interaction.editReply('❌ Clan not found.');
                const memberRoles = (interaction.member as GuildMember).roles.cache.map(r => r.id);
                const roverCheck = await verifyUserRoblox(interaction.user.id, interaction.guildId!, memberRoles);
                if (!roverCheck.verified) return interaction.editReply(`❌ ${roverCheck.message}`);
                const existingReq = await db.clanRequest.findFirst({ where: { userId: interaction.user.id, clanId: clan.id } });
                if (existingReq) return interaction.editReply('❌ You already have a pending application for this clan.');
                await db.clanRequest.create({ data: { userId: interaction.user.id, clanId: clan.id } });
                return interaction.editReply(`✅ Application sent to **${clan.name}**. Wait for the FO/GM to review it.`);
            }

            const isManager = executorUser.clanRank === 'FO' || executorUser.clanRank === 'GM';
            const isOwner = executorUser.clanRank === 'FO';

            if (['requests', 'accept', 'deny', 'release'].includes(sub)) {
                if (!executorUser.clanId || !isManager) return interaction.editReply('⛔ You must be an FO or GM.');
                
                if (sub === 'requests') {
                    const reqs = await db.clanRequest.findMany({ where: { clanId: executorUser.clanId } });
                    if (!reqs.length) return interaction.editReply('📋 No pending requests.');
                    const embed = new EmbedBuilder().setTitle('📋 Pending Applications').setDescription(reqs.map(r => `• <@${r.userId}>`).join('\n')).setColor('#337def');
                    return interaction.editReply({ embeds: [embed] });
                }

                if (sub === 'accept') {
                    const target = interaction.options.getUser('user', true);
                    const req = await db.clanRequest.findFirst({ where: { userId: target.id, clanId: executorUser.clanId } });
                    if (!req) return interaction.editReply('❌ This user has not applied.');
                    const targetDb = await db.user.findUnique({ where: { id: target.id } });
                    if (targetDb?.clanId) return interaction.editReply('❌ User is already in a clan.');

                    await db.user.update({ where: { id: target.id }, data: { clanId: executorUser.clanId, clanRank: 'MEMBER' } });
                    await db.clanRequest.deleteMany({ where: { userId: target.id } }); 
                    
                    if (executorUser.clan?.roleId) {
                        try {
                            const role = interaction.guild?.roles.cache.get(executorUser.clan.roleId);
                            const member = await interaction.guild?.members.fetch(target.id);
                            if (member && role) await member.roles.add(role);
                        } catch (e) { logger.error('Clan Accept Role Assign', e); }
                    }
                    return interaction.editReply(`✅ <@${target.id}> has been accepted!`);
                }

                if (sub === 'deny') {
                    const target = interaction.options.getUser('user', true);
                    await db.clanRequest.deleteMany({ where: { userId: target.id, clanId: executorUser.clanId } });
                    return interaction.editReply(`🚫 Denied application.`);
                }

                if (sub === 'release') {
                    const target = interaction.options.getUser('user', true);
                    const targetDb = await db.user.findUnique({ where: { id: target.id } });
                    if (targetDb?.clanId !== executorUser.clanId) return interaction.editReply('❌ User not in your clan.');
                    if (targetDb.clanRank === 'FO') return interaction.editReply('❌ Cannot kick FO.');
                    if (executorUser.clanRank === 'GM' && targetDb.clanRank === 'GM') return interaction.editReply('❌ GMs cannot kick GMs.');

                    await db.user.update({ where: { id: target.id }, data: { clanId: null, clanRank: 'MEMBER' } });
                    if (executorUser.clan?.roleId) {
                        try {
                            const role = interaction.guild?.roles.cache.get(executorUser.clan.roleId);
                            const member = await interaction.guild?.members.fetch(target.id);
                            if (member && role) await member.roles.remove(role);
                        } catch (e) { }
                    }
                    return interaction.editReply(`👢 <@${target.id}> released from clan.`);
                }
            }

            if (['promote', 'demote', 'transfer'].includes(sub)) {
                if (!executorUser.clanId || !isOwner) return interaction.editReply('⛔ FO only.');
                const target = interaction.options.getUser('user', true);
                const targetDb = await db.user.findUnique({ where: { id: target.id } });
                if (targetDb?.clanId !== executorUser.clanId) return interaction.editReply('❌ User not in your clan.');

                if (sub === 'promote') {
                    if (targetDb.clanRank === 'GM') return interaction.editReply('❌ Already GM.');
                    const gmCount = await db.user.count({ where: { clanId: executorUser.clanId, clanRank: 'GM' } });
                    if (gmCount >= 3) return interaction.editReply('❌ Maximum 3 GMs.');
                    await db.user.update({ where: { id: target.id }, data: { clanRank: 'GM' } });
                    return interaction.editReply(`🔼 <@${target.id}> is now a GM.`);
                }
                if (sub === 'demote') {
                    if (targetDb.clanRank !== 'GM') return interaction.editReply('❌ Not a GM.');
                    await db.user.update({ where: { id: target.id }, data: { clanRank: 'MEMBER' } });
                    return interaction.editReply(`🔽 <@${target.id}> demoted.`);
                }
                if (sub === 'transfer') {
                    await db.user.update({ where: { id: target.id }, data: { clanRank: 'FO' } });
                    await db.user.update({ where: { id: executorUser.id }, data: { clanRank: 'MEMBER' } });
                    await db.clan.update({ where: { id: executorUser.clanId }, data: { ownerId: target.id } });
                    return interaction.editReply(`👑 <@${target.id}> is the new FO.`);
                }
            }

            if (sub === 'add' || sub === 'disband' || sub === 'message') {
                if (!interaction.memberPermissions?.has('Administrator')) return interaction.editReply('⛔ Unauthorized.');
                
                if (sub === 'add') {
                    const name = interaction.options.getString('name', true);
                    const fo = interaction.options.getUser('franchise_owner', true);
                    if (fo.bot) return interaction.editReply('❌ Bots cannot be FOs.');
                    const exists = await db.clan.findUnique({ where: { name } });
                    if (exists) return interaction.editReply(`❌ Clan already exists.`);

                    const logo = interaction.options.getAttachment('logo');
                    const colorInput = interaction.options.getString('color');
                    const roleIcon = interaction.options.getAttachment('role_icon');
                    
                    // 🧠 Smart Color Parser
                    let parsedColor: ColorResolvable | undefined = undefined;
                    if (colorInput) {
                        const cleanInput = colorInput.trim();
                        if (/^[0-9A-Fa-f]{6}$/i.test(cleanInput)) {
                            parsedColor = `#${cleanInput}` as ColorResolvable; // e.g. ff0000 -> #ff0000
                        } else if (cleanInput.startsWith('#')) {
                            parsedColor = cleanInput as ColorResolvable; // e.g. #ff0000
                        } else {
                            parsedColor = (cleanInput.charAt(0).toUpperCase() + cleanInput.slice(1).toLowerCase()) as ColorResolvable; // e.g. blue -> Blue
                        }
                    }

                    let role;
                    let roleMsg = '✅ Role created.';
                    try {
                        role = await interaction.guild?.roles.create({ name, color: parsedColor, icon: roleIcon?.url || logo?.url, reason: 'OCL Clan' });
                    } catch (e: any) {
                        if (e.message.includes('icon') || e.message.includes('Premium')) {
                            try { role = await interaction.guild?.roles.create({ name, color: parsedColor }); roleMsg = '⚠️ Role created without icon (Requires Boost Lvl 2).'; } 
                            catch (fatal: any) { logger.error(`Clan Add`, fatal); return interaction.editReply(`❌ Role failed: \`${fatal.message}\``); }
                        } else { logger.error(`Clan Add`, e); return interaction.editReply(`❌ Role failed: \`${e.message}\``); }
                    }

                    if (role) {
                        try { const member = await interaction.guild?.members.fetch(fo.id); if (member) await member.roles.add(role); } 
                        catch (e: any) { roleMsg += `\n⚠️ Failed to assign role to FO.`; }
                    }

                    await db.user.upsert({ where: { id: fo.id }, update: { clanId: null }, create: { id: fo.id } });
                    const clan = await db.clan.create({ data: { name, ownerId: fo.id, logo: logo?.url || null, roleId: role?.id } });
                    await db.user.update({ where: { id: fo.id }, data: { clanId: clan.id, clanRank: 'FO' } });
                    return interaction.editReply(`✅ Clan **${name}** created. <@${fo.id}> is FO.\n${roleMsg}`);
                }

                if (sub === 'disband') {
                    const clan = await db.clan.findUnique({ where: { name: interaction.options.getString('clan', true) } });
                    if (!clan) return interaction.editReply('❌ Clan not found.');
                    if (clan.roleId) {
                        try { const role = interaction.guild?.roles.cache.get(clan.roleId); if (role) await role.delete(); } catch (e) {}
                    }
                    await db.clan.delete({ where: { id: clan.id } });
                    return interaction.editReply(`🗑️ **${clan.name}** disbanded.\n**Reason:** ${interaction.options.getString('reason', true)}`);
                }
                
                if (sub === 'message') {
                    const clan = await db.clan.findUnique({ where: { name: interaction.options.getString('clan', true) } });
                    if (!clan) return interaction.editReply('❌ Clan not found.');
                    try {
                        const foUser = await interaction.client.users.fetch(clan.ownerId);
                        await foUser.send(`**Message from Staff regarding Clan ${clan.name}:**\n${interaction.options.getString('message', true)}`);
                        return interaction.editReply('✅ Sent to FO.');
                    } catch (e) { return interaction.editReply('❌ Failed to DM FO.'); }
                }
            }
        } catch (error) {
            logger.error(`Clan Command`, error);
            return interaction.editReply('❌ Critical error occurred.');
        }
    }
};
