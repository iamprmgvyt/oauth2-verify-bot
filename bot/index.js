require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const { Client, GatewayIntentBits, REST, Routes, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const axios = require('axios');
const bodyParser = require('body-parser');
const welcomeCanvas = require('./canvas'); 

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// --- CONFIG & CONSTANTS ---
const BRAND_NAME = "Synapse Pass";
const SUPPORT_EMAIL = "support@synapsepass.xyz";
const COLOR_THEME = 0x3B82F6; // Blue 500

// --- CONNECT DB ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log(`✅ ${BRAND_NAME} Database Connected`))
    .catch(err => console.error('❌ MongoDB Error:', err));

// --- SCHEMAS ---
const VerifyStateSchema = new mongoose.Schema({
    guildId: String,
    channelId: String,
    roleId: String,
    state: { type: String, unique: true },
    lang: { type: String, default: 'en' },
    welcomeEnabled: { type: Boolean, default: true }
});

const GuildSettingsSchema = new mongoose.Schema({
    guildId: { type: String, unique: true },
    lang: { type: String, default: 'en' },
    welcomeChannelId: String
});

const UserBackupSchema = new mongoose.Schema({
    userId: String,
    accessToken: String,
    guildId: String
});

const VerifyState = mongoose.model('VerifyState', VerifyStateSchema);
const GuildSettings = mongoose.model('GuildSettings', GuildSettingsSchema);
const UserBackup = mongoose.model('UserBackup', UserBackupSchema);

// --- BOT SETUP ---
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

// Slash Commands Definition
const commands = [
    {
        name: 'setup-verify',
        description: 'Setup Synapse Pass verification',
        options: [
            { type: 7, name: 'channel', description: 'Target channel', required: true },
            { type: 8, name: 'role', description: 'Verified role', required: true },
            { type: 3, name: 'lang', description: 'Language (en/vi)', required: false, choices: [{name: 'English', value: 'en'}, {name: 'Vietnamese', value: 'vi'}] }
        ]
    },
    {
        name: 'help',
        description: 'Show Synapse Pass commands list',
    },
    {
        name: 'invite',
        description: 'Get the invite link for Synapse Pass',
    },
    {
        name: 'support',
        description: 'Contact Synapse Pass support team',
    },
    {
        name: 'set-lang',
        description: 'Change server language',
        options: [
            { type: 3, name: 'language', description: 'en or vi', required: true, choices: [{name: 'English', value: 'en'}, {name: 'Vietnamese', value: 'vi'}] }
        ]
    }
];

client.on('ready', async () => {
    console.log(`✅ ${client.user.tag} (${BRAND_NAME}) is Online`);
    
    // Set Custom Status
    client.user.setActivity('Protecting Servers', { type: 'WATCHING' });

    // Register Commands
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
        console.log(`✅ Slash Commands Registered for ${BRAND_NAME}`);
    } catch (e) { console.error(e); }
});

// Interaction Handler
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    // --- HELP COMMAND ---
    if (commandName === 'help') {
        const helpEmbed = new EmbedBuilder()
            .setTitle(`${BRAND_NAME} Commands`)
            .setDescription('List of available commands:')
            .addFields(
                { name: '/setup-verify [channel] [role]', value: 'Setup the verification system.', inline: false },
                { name: '/invite', value: 'Get the bot invite link.', inline: true },
                { name: '/support', value: 'Contact support team.', inline: true },
                { name: '/set-lang', value: 'Change language (en/vi).', inline: true }
            )
            .setColor(COLOR_THEME)
            .setFooter({ text: 'Synapse Pass Security' });
        await interaction.reply({ embeds: [helpEmbed], ephemeral: true });
    }

    // --- INVITE COMMAND ---
    if (commandName === 'invite') {
        const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${process.env.CLIENT_ID}&permissions=8&scope=bot%20applications.commands`;
        const inviteEmbed = new EmbedBuilder()
            .setTitle('Invite Synapse Pass')
            .setDescription(`Click the button below to add **${BRAND_NAME}** to your server.`)
            .setColor(COLOR_THEME);
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setLabel('Invite Bot').setStyle(ButtonStyle.Link).setURL(inviteUrl)
        );
        await interaction.reply({ embeds: [inviteEmbed], components: [row], ephemeral: true });
    }

    // --- SUPPORT COMMAND ---
    if (commandName === 'support') {
        const supportEmbed = new EmbedBuilder()
            .setTitle('Need Help?')
            .setDescription(`If you encounter any issues with **${BRAND_NAME}**, please contact our support team.`)
            .addFields({ name: 'Email', value: `**${SUPPORT_EMAIL}**` })
            .setColor(COLOR_THEME);
        await interaction.reply({ embeds: [supportEmbed], ephemeral: true });
    }

    // --- SETUP VERIFY COMMAND ---
    if (commandName === 'setup-verify') {
        const channel = interaction.options.getChannel('channel');
        const role = interaction.options.getRole('role');
        const lang = interaction.options.getString('lang') || 'en';

        // Check Permissions
        if (role.position >= interaction.guild.members.me.roles.highest.position) {
            return interaction.reply({ 
                content: '❌ Error: The Bot role must be higher than the Verified role!', 
                ephemeral: true 
            });
        }

        const uniqueState = `synapse_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        await VerifyState.create({
            state: uniqueState, guildId: interaction.guildId,
            channelId: channel.id, roleId: role.id, lang: lang
        });
        
        await GuildSettings.findOneAndUpdate({ guildId: interaction.guildId }, { lang, welcomeChannelId: channel.id }, { upsert: true });

        const vercelUrl = process.env.VERCEL_URL;
        const embed = new EmbedBuilder()
            .setTitle(`${BRAND_NAME} Verification`)
            .setDescription(lang === 'vi' ? 'Xác thực bằng Synapse Pass để tiếp tục.' : 'Verify with Synapse Pass to continue.')
            .setColor(COLOR_THEME)
            .setFooter({ text: 'Secure Connection' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setLabel('Verify').setStyle(ButtonStyle.Link).setURL(`${vercelUrl}/pages/?state=${uniqueState}`)
        );

        await channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: `✅ ${BRAND_NAME} setup complete in ${channel.name}!`, ephemeral: true });
    }

    // --- SET LANG COMMAND ---
    if (commandName === 'set-lang') {
        const lang = interaction.options.getString('language');
        await GuildSettings.findOneAndUpdate({ guildId: interaction.guildId }, { lang }, { upsert: true });
        await interaction.reply({ content: `✅ Language set to ${lang.toUpperCase()}`, ephemeral: true });
    }
});

// Smart Welcome Event
client.on('guildMemberAdd', async member => {
    const settings = await GuildSettings.findOne({ guildId: member.guild.id });
    if (settings && settings.welcomeChannelId) {
        const channel = member.guild.channels.cache.get(settings.welcomeChannelId);
        if (channel) {
            const buffer = await welcomeCanvas(member);
            channel.send({ files: [ { attachment: buffer, name: 'synapse-welcome.png' } ] });
        }
    }
});

// --- API ENDPOINTS ---

app.get('/api/config', async (req, res) => {
    const { state } = req.query;
    if (!state) return res.status(400).json({ error: 'Missing state' });
    const config = await VerifyState.findOne({ state });
    if (!config) return res.status(404).json({ error: 'Setup not found' });

    res.json({
        lang: config.lang,
        guildId: config.guildId,
        brand: BRAND_NAME,
        successPage: '/pages/success.html',
        errorPage: '/pages/error.html'
    });
});

app.get('/auth/callback', async (req, res) => {
    const { code, state } = req.query;
    let redirectUrl = process.env.VERCEL_URL + '/pages/success.html';

    try {
        if (!state) throw new Error('NO_STATE');
        const config = await VerifyState.findOne({ state });
        if (!config) throw new Error('NO_SETUP');

        const tokenRes = await axios.post('https://discord.com/api/oauth2/token', 
            new URLSearchParams({
                client_id: process.env.CLIENT_ID,
                client_secret: process.env.CLIENT_SECRET,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: process.env.REDIRECT_URI,
                scope: 'identify guilds.join'
            }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
        
        const { access_token } = tokenRes.data;
        const userRes = await axios.get('https://discord.com/api/users/@me', { headers: { 'Authorization': `Bearer ${access_token}` } });
        const userId = userRes.data.id;

        await UserBackup.create({ userId, accessToken: access_token, guildId: config.guildId });

        const guild = await client.guilds.fetch(config.guildId);
        let member;
        try {
            member = await guild.members.fetch(userId);
        } catch (e) {
            await guild.members.add({ user: userId, accessToken: access_token, roles: [config.roleId] });
            return res.redirect(`${redirectUrl}?lang=${config.lang}&brand=${BRAND_NAME}`);
        }

        try {
            await member.roles.add(config.roleId);
        } catch (err) {
            console.error("Role Hierarchy Error:", err);
            redirectUrl = `${process.env.VERCEL_URL}/pages/error.html?error=hierarchy&lang=${config.lang}`;
            return res.redirect(redirectUrl);
        }

        res.redirect(`${redirectUrl}?lang=${config.lang}&brand=${BRAND_NAME}`);

    } catch (error) {
        console.error("Callback Error:", error.message);
        let errorCode = 'unknown';
        if (error.message === 'NO_STATE' || error.message === 'NO_SETUP') errorCode = 'no_setup';
        res.redirect(`${process.env.VERCEL_URL}/pages/error.html?error=${errorCode}`);
    }
});

app.listen(process.env.PORT || 3000, () => console.log('🚀 Synapse Pass Server Running'));
client.login(process.env.TOKEN);
