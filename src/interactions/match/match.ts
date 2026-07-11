import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, GuildMember } from 'discord.js';
import { db } from '../../database/db';

export const matchCommand = {
    data: new SlashCommandBuilder()
        .setName('match')
        .setDescription('Core competitive match engine')
        .addSubcommand(s => s.setName('host').setDescription('Host a new match').addStringOption(o => o.setName('mode').setDescription('Match mode').setRequired(true).addChoices({ name: 'Ranked', value: 'ranked' }, { name: 'Casual', value: 'casual' })))
        .addSubcommand(s => s.setName('teams').setDescription('Generate balanced teams for your active match'))
        .addSubcommandGroup(g => g.setName('manage').setDescription('Staff queue overrides')
            .addSubcommand(s => s.setName('end').setDescription('Cleanly end active match'))
            .addSubcommand(s => s.setName('cancel').setDescription('Forcibly destroy a queue'))
            .addSubcommand(s => s.setName('forcejoin').setDescription('Admin: Bypass verification to insert player').addUserOption(o => o.setName('user').setDescription('Player to insert').setRequired(true)))
            .addSubcommand(s => s.setName('forceleave').setDescription('Admin: Forcibly remove player from queue').addUserOption(o => o.setName('user').setDescription('Player to remove').setRequired(true)))
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        const settings = await db.settings.findUnique({ where: { id: 'global' } });
        const member = interaction.member as GuildMember;
        
        // Match Hoster Verification Check
        const isHoster = member.permissions.has('Administrator') || (settings?.matchHosterRoleId && member.roles.cache.has(settings.matchHosterRoleId));
        if (!isHoster) return interaction.reply({ content: '⛔ You do not have the Match Hoster role required to manipulate queues.', ephemeral: true });

        const sub = interaction.options.getSubcommand();

        if (sub === 'host') {
            const mode = interaction.options.getString('mode', true);
            const existing = await db.league.findFirst({ where: { hostId: interaction.user.id, status: 'PENDING' } });
            if (existing) return interaction.reply({ content: '❌ You are already hosting a pending match.', ephemeral: true });

            const league = await db.league.create({ data: { hostId: interaction.user.id, channelId: interaction.channelId } });
            
            await interaction.reply({ content: '✅ Match queue successfully deployed to this channel.', ephemeral: true });

            const embed = new EmbedBuilder()
                .setTitle(`🏆 OCL ${mode.charAt(0).toUpperCase() + mode.slice(1)} Queue`)
                .setDescription(`**Host:** <@${interaction.user.id}>\n\n**Players Joined: 0/10**\n*Click below to enter the queue.*\n\n*Match ID: ${league.id}*`)
                .setColor('#337def')
                .setImage('https://i.imgur.com/KvxOH6m.png');

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId(`join_match_${league.id}`).setLabel('Join Match').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`leave_match_${league.id}`).setLabel('Leave').setStyle(ButtonStyle.Danger)
            );

            await interaction.channel?.send({ embeds: [embed], components: [row] });
        }

        if (sub === 'teams') {
            const league = await db.league.findFirst({ where: { hostId: interaction.user.id, status: 'PENDING' } });
            if (!league) return interaction.reply({ content: '❌ No pending match found.', ephemeral: true });

            const players = await db.user.findMany({ where: { activeLeague: league.id } });
            if (players.length < 2) return interaction.reply({ content: '❌ Not enough players to generate teams.', ephemeral: true });

            const shuffled = players.sort(() => 0.5 - Math.random());
            const mid = Math.ceil(shuffled.length / 2);
            
            await interaction.reply({ content: '✅ Teams generated.', ephemeral: true });
            await db.league.update({ where: { id: league.id }, data: { status: 'ACTIVE' } });

            const embed = new EmbedBuilder()
                .setTitle('🎲 Match Teams Generated')
                .addFields(
                    { name: '🔵 Team A', value: shuffled.slice(0, mid).map(p => `<@${p.id}>`).join('\n') || 'Empty', inline: true },
                    { name: '🔴 Team B', value: shuffled.slice(mid).map(p => `<@${p.id}>`).join('\n') || 'Empty', inline: true }
                )
                .setColor('#337def')
                .setThumbnail('https://i.imgur.com/f5LGesj.png');

            await interaction.channel?.send({ content: `🚨 <@${league.hostId}>, your teams are ready!`, embeds: [embed] });
        }

        if (sub === 'end' || sub === 'cancel') {
            const league = await db.league.findFirst({ where: { hostId: interaction.user.id, status: { in: ['PENDING', 'ACTIVE'] } } });
            if (!league) return interaction.reply({ content: '❌ No active match found.', ephemeral: true });
            
            await db.user.updateMany({ where: { activeLeague: league.id }, data: { activeLeague: null } });
            
            if (sub === 'end') await db.league.update({ where: { id: league.id }, data: { status: 'CLOSED' } });
            if (sub === 'cancel') await db.league.delete({ where: { id: league.id } }); // Totally wipe it from DB
            
            await interaction.reply({ content: `✅ Match ${sub === 'end' ? 'closed' : 'destroyed'} successfully.`, ephemeral: true });
        }

        if (sub === 'forcejoin') {
            const target = interaction.options.getUser('user', true);
            const league = await db.league.findFirst({ where: { hostId: interaction.user.id, status: 'PENDING' } });
            if (!league) return interaction.reply({ content: '❌ You must be hosting an active queue to insert a player.', ephemeral: true });
            
            await db.user.upsert({ where: { id: target.id }, update: { activeLeague: league.id }, create: { id: target.id, activeLeague: league.id }});
            return interaction.reply({ content: `✅ Administratively bypassed verification and forced <@${target.id}> into your match queue.`, ephemeral: true });
        }

        if (sub === 'forceleave') {
            const target = interaction.options.getUser('user', true);
            await db.user.updateMany({ where: { id: target.id }, data: { activeLeague: null } });
            return interaction.reply({ content: `👢 Forcibly kicked <@${target.id}> from all match queues.`, ephemeral: true });
        }
    }
};
