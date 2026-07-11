import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { db } from '../../database/db';

export const matchCommand = {
    data: new SlashCommandBuilder()
        .setName('match')
        .setDescription('Core competitive match engine')
        .addSubcommand(s => s.setName('host').setDescription('Host a new match').addStringOption(o => o.setName('mode').setDescription('Match mode').setRequired(true).addChoices({ name: 'Ranked', value: 'ranked' }, { name: 'Casual', value: 'casual' })))
        .addSubcommand(s => s.setName('teams').setDescription('Generate balanced teams for your active match'))
        .addSubcommandGroup(g => g.setName('manage').setDescription('Host & Staff match management').addSubcommand(s => s.setName('end').setDescription('End the current match'))),

    async execute(interaction: ChatInputCommandInteraction) {
        const sub = interaction.options.getSubcommand();

        if (sub === 'host') {
            const mode = interaction.options.getString('mode', true);
            const existing = await db.league.findFirst({ where: { hostId: interaction.user.id, status: 'PENDING' } });
            if (existing) return interaction.reply({ content: '❌ You are already hosting an active queue.', ephemeral: true });

            const league = await db.league.create({ data: { hostId: interaction.user.id, channelId: interaction.channelId } });
            
            // Ephemeral confirmation to the Host
            await interaction.reply({ content: '✅ Match queue successfully deployed to this channel.', ephemeral: true });

            // Public deployment to the channel
            const embed = new EmbedBuilder()
                .setTitle(`🏆 OCL ${mode.charAt(0).toUpperCase() + mode.slice(1)} Queue`)
                .setDescription(`**Host:** <@${interaction.user.id}>\n\n**Players Joined: 0/10**\n*Click below to enter the queue.*`)
                .setColor('#337def')
                .setImage('https://i.imgur.com/KvxOH6m.png')
                .setFooter({ text: `Match ID: ${league.id}` });

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
            
            await interaction.reply({ content: '✅ Teams generated successfully.', ephemeral: true });

            const embed = new EmbedBuilder()
                .setTitle('🎲 Match Teams Generated')
                .addFields({ name: '🔵 Team A', value: shuffled.slice(0, mid).map(p => `<@${p.id}>`).join('\n') || 'Empty', inline: true }, { name: '🔴 Team B', value: shuffled.slice(mid).map(p => `<@${p.id}>`).join('\n') || 'Empty', inline: true })
                .setColor('#337def')
                .setThumbnail('https://i.imgur.com/f5LGesj.png');

            await db.league.update({ where: { id: league.id }, data: { status: 'ACTIVE' } });
            await interaction.channel?.send({ content: `🚨 <@${league.hostId}>, your teams are ready!`, embeds: [embed] });
        }
        
        if (sub === 'end') {
            const league = await db.league.findFirst({ where: { hostId: interaction.user.id, status: { in: ['PENDING', 'ACTIVE'] } } });
            if (!league) return interaction.reply({ content: '❌ No active match found.', ephemeral: true });
            
            await db.user.updateMany({ where: { activeLeague: league.id }, data: { activeLeague: null } });
            await db.league.update({ where: { id: league.id }, data: { status: 'CLOSED' } });
            
            await interaction.reply({ content: '✅ Match closed safely.', ephemeral: true });
            await interaction.channel?.send({ content: `🛑 The match hosted by <@${league.hostId}> has been administratively concluded.` });
        }
    }
};
