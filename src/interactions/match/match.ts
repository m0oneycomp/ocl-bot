import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, GuildMember, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { db } from '../../database/db';
import { verifyPlayer } from '../../services/verification';

export const matchCommand = {
    data: new SlashCommandBuilder()
        .setName('match')
        .setDescription('Advanced Matchmaking & Reporting Engine')
        .addSubcommand(s => s.setName('host').setDescription('Deploy a new match queue')
            .addStringOption(o => o.setName('matchtype').setDescription('Format').setRequired(true).addChoices({name: '1v1', value: '1v1'}, {name: '2v2', value: '2v2'}, {name: '3v3', value: '3v3'}, {name: '4v4', value: '4v4'}, {name: '5v5', value: '5v5'}))
            .addStringOption(o => o.setName('region').setDescription('Server Region').setRequired(true).addChoices({name: 'NA East', value: 'NA East'}, {name: 'NA West', value: 'NA West'}, {name: 'Europe', value: 'Europe'}, {name: 'OCE (Australia)', value: 'OCE'}, {name: 'Asia', value: 'Asia'}))
            .addStringOption(o => o.setName('vipserver').setDescription('Private Server Link (Hidden from public)').setRequired(false)))
        .addSubcommand(s => s.setName('report').setDescription('Staff: Officially declare match results')
            .addStringOption(o => o.setName('match_id').setDescription('The 8-character Match ID').setRequired(true))
            .addStringOption(o => o.setName('winner').setDescription('Winning Team').setRequired(true).addChoices({name: 'Team A', value: 'A'}, {name: 'Team B', value: 'B'}))
            .addIntegerOption(o => o.setName('score_a').setDescription('Team A Score (Wins)').setRequired(true))
            .addIntegerOption(o => o.setName('score_b').setDescription('Team B Score (Wins)').setRequired(true)))
        .addSubcommandGroup(g => g.setName('manage').setDescription('Staff queue overrides')
            .addSubcommand(s => s.setName('cancel').setDescription('Forcibly destroy a queue without points'))),

    async execute(interaction: ChatInputCommandInteraction) {
        const settings = await db.settings.findUnique({ where: { id: 'global' } });
        const member = interaction.member as GuildMember;
        const sub = interaction.options.getSubcommand();

        if (sub === 'host') {
            const isHoster = member.permissions.has('Administrator') || (settings?.matchHosterRoleId && member.roles.cache.has(settings.matchHosterRoleId));
            if (!isHoster) return interaction.reply({ content: '⛔ You lack the Match Hoster role.', ephemeral: true });

            let gameType = null;
            if (interaction.channelId === settings?.rankedChannelId) gameType = 'Ranked';
            else if (interaction.channelId === settings?.leagueChannelId) gameType = 'League';
            else if (interaction.channelId === settings?.scrimChannelId) gameType = 'Scrim';
            
            if (!gameType) return interaction.reply({ content: '❌ Run this in a designated Deployment channel.', ephemeral: true });

            const matchType = interaction.options.getString('matchtype', true);
            const region = interaction.options.getString('region', true);
            const vipServer = interaction.options.getString('vipserver');
            const capacity = parseInt(matchType.split('v')[0]) * 2;

            const league = await db.league.create({ data: { hostId: interaction.user.id, channelId: interaction.channelId, gameType, matchType, region, vipServer, capacity } });
            await db.user.upsert({ where: { id: interaction.user.id }, update: { activeLeague: league.id }, create: { id: interaction.user.id, activeLeague: league.id } });

            await interaction.reply({ content: '✅ Queue deployed.', ephemeral: true });

            const embed = new EmbedBuilder()
                .setTitle(`🏆 OCL ${gameType} Queue [${matchType}]`)
                .setDescription(`**Host:** <@${interaction.user.id}>\n**Region:** ${region}\n\n**Players Joined: 1/${capacity}**`)
                .setColor('#337def');

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId(`join_match_${league.id}`).setLabel('Join').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`leave_match_${league.id}`).setLabel('Leave').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(`cancel_match_${league.id}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
            );
            await interaction.channel?.send({ embeds: [embed], components: [row] });
        }

        if (sub === 'report') {
            let isReporter = member.permissions.has('Administrator');
            if (settings?.matchReporterRoleId) {
                const reporterRole = interaction.guild?.roles.cache.get(settings.matchReporterRoleId);
                if (reporterRole && member.roles.highest.position >= reporterRole.position) {
                    isReporter = true;
                }
            }

            if (!isReporter) return interaction.reply({ content: '⛔ You do not have permissions to officially report matches.', ephemeral: true });

            const shortId = interaction.options.getString('match_id', true).toUpperCase();
            const winner = interaction.options.getString('winner', true);
            const scoreA = interaction.options.getInteger('score_a', true);
            const scoreB = interaction.options.getInteger('score_b', true);

            const league = await db.league.findFirst({ where: { shortId, status: 'ACTIVE' } });
            if (!league) return interaction.reply({ content: '❌ Could not find an ACTIVE match with that ID.', ephemeral: true });

            const players = await db.user.findMany({ where: { activeLeague: league.id } });
            const winPts = settings?.winPoints ?? 25;
            const losePts = settings?.losePoints ?? 0;

            const matchRecord = await db.match.create({ data: { leagueId: league.id, winningTeam: winner, teamAScore: scoreA, teamBScore: scoreB } }).catch(() => null);

            for (const p of players) {
                const isWinner = p.activeTeam === winner;
                await db.user.update({
                    where: { id: p.id },
                    data: { points: { increment: isWinner ? winPts : losePts }, elo: { increment: isWinner ? 15 : -10 }, activeLeague: null, activeTeam: null }
                });
                if (matchRecord) await db.matchPlayer.create({ data: { matchId: matchRecord.id, userId: p.id, win: isWinner } }).catch(() => null);
            }

            await db.league.update({ where: { id: league.id }, data: { status: 'CLOSED' } });
            await interaction.reply({ content: `✅ Match **${shortId}** verified. Team ${winner} won (${scoreA} - ${scoreB}). Points distributed.`, ephemeral: true });
        }
    }
};
