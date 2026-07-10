import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } from 'discord.js';
import { db } from '../../database/db';

export const matchCommand = {
    data: new SlashCommandBuilder()
        .setName('match')
        .setDescription('Core competitive match engine')
        .addSubcommand(s => s.setName('host').setDescription('Host a new match')
            .addStringOption(o => o.setName('mode').setDescription('Match mode').setRequired(true).addChoices({ name: 'Ranked', value: 'ranked' }, { name: 'Casual', value: 'casual' })))
        .addSubcommand(s => s.setName('teams').setDescription('Generate balanced teams for your active match'))
        .addSubcommandGroup(g => g.setName('manage').setDescription('Host & Staff match management')
            .addSubcommand(s => s.setName('end').setDescription('End the current match'))
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        const sub = interaction.options.getSubcommand();

        if (sub === 'host') {
            const mode = interaction.options.getString('mode', true);
            const existing = await db.league.findFirst({ where: { hostId: interaction.user.id, status: 'PENDING' } });
            if (existing) return interaction.reply({ content: '❌ You are already hosting an active queue.', ephemeral: true });

            let thread;
            if (interaction.channel?.type === ChannelType.GuildText) {
                thread = await interaction.channel.threads.create({ name: `OCL Match - ${interaction.user.username}`, autoArchiveDuration: 60, reason: 'OCL League Match Thread' });
            }

            const league = await db.league.create({ data: { hostId: interaction.user.id, channelId: interaction.channelId, threadId: thread?.id } });

            const embed = new EmbedBuilder()
                .setTitle(`🏆 OCL ${mode.charAt(0).toUpperCase() + mode.slice(1)} Queue`)
                .setDescription(`**Host:** <@${interaction.user.id}>\n\n**Players Joined: 0/10**\n*Click below to enter the queue.*`)
                .setColor('#337def') // Brand Color
                .setImage('https://i.imgur.com/KvxOH6m.png') // 16:9 Banner
                .setThumbnail('https://i.imgur.com/f5LGesj.png') // 1:1 Logo
                .setFooter({ text: `Match ID: ${league.id}` });

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId(`join_match_${league.id}`).setLabel('Join Match').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`leave_match_${league.id}`).setLabel('Leave').setStyle(ButtonStyle.Danger)
            );

            await interaction.reply({ embeds: [embed], components: [row] });
            if (thread) await thread.send(`Match Thread officially opened by <@${interaction.user.id}>. Stand by for team generation.`);
        }

        if (sub === 'teams') {
            const league = await db.league.findFirst({ where: { hostId: interaction.user.id, status: 'PENDING' } });
            if (!league) return interaction.reply({ content: '❌ You are not hosting a pending match.', ephemeral: true });

            const players = await db.user.findMany({ where: { activeLeague: league.id } });
            if (players.length < 2) return interaction.reply({ content: '❌ Not enough players to generate teams.', ephemeral: true });

            const shuffled = players.sort(() => 0.5 - Math.random());
            const mid = Math.ceil(shuffled.length / 2);
            
            const embed = new EmbedBuilder()
                .setTitle('🎲 Match Teams Generated')
                .addFields(
                    { name: '🔵 Team A', value: shuffled.slice(0, mid).map(p => `<@${p.id}>`).join('\n') || 'Empty', inline: true },
                    { name: '🔴 Team B', value: shuffled.slice(mid).map(p => `<@${p.id}>`).join('\n') || 'Empty', inline: true }
                )
                .setColor('#337def') // Brand Color
                .setThumbnail('https://i.imgur.com/f5LGesj.png');

            await db.league.update({ where: { id: league.id }, data: { status: 'ACTIVE' } });
            return interaction.reply({ embeds: [embed] });
        }

        if (sub === 'end') {
            const league = await db.league.findFirst({ where: { hostId: interaction.user.id, status: { in: ['PENDING', 'ACTIVE'] } } });
            if (!league) return interaction.reply({ content: '❌ No active match found.', ephemeral: true });
            
            await db.user.updateMany({ where: { activeLeague: league.id }, data: { activeLeague: null } });
            await db.league.update({ where: { id: league.id }, data: { status: 'CLOSED' } });
            return interaction.reply({ content: '🛑 Match ended. All players have been released from the queue.' });
        }
    }
};
