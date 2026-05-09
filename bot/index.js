require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const { Client, GatewayIntentBits, REST, Routes, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const axios = require('axios');
const bodyParser = require('body-parser');
const welcomeCanvas = require('./canvas'); // Import module canvas

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// --- CONNECT DB ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ Connected to MongoDB'))
    .catch(err => console.error('❌ MongoDB Error:', err));

// --- SCHEMAS ---
const GuildConfigSchema = new mongoose.Schema({
    guildId: String,
    channelId: String,
    roleId: String,
    state: { type: String, unique: true },
    lang: { type: String, default: 'en' }, // 'en' or 'vi'
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

const VerifyState = mongoose.model('VerifyState', GuildConfigSchema);
const GuildSettings = mongoose.model('GuildSettings', GuildSettingsSchema);
const UserBackup = mongoose.model('UserBackup', UserBackupSchema);

// --- BOT SETUP ---
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

// Commands
const commands = [
    {
        name: 'setup-verify',
        description: 'Setup verification channel & role',
        options: [
            { type: 7, name: 'channel', description: 'Target channel', required: true },
            { type: 8, name: 'role', description: 'Target role', required: true },
            { type: 3, name: 'lang', description: 'Language (en/vi)', required: false, choices: [{name: 'English', value: 'en'}, {name: 'Vietnamese', value: 'vi'}] }
        ]
    },
    {
        name: 'set-lang',
        description: 'Set server language',
        options: [
            { type: 3, name: 'language', description: 'en or vi', required: true, choices: [{name: 'English', value: 'en'}, {name: 'Vietnamese', value: 'vi'}] }
        ]
    }
];

client.on('ready', async () => {
    console.log(`✅ ${client.user.tag} is Online`);
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    } catch (e) { console.error(e); }
});

// Interaction Handler
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    if (commandName === 'setup-verify') {
        const channel = interaction.options.getChannel('channel');
        const role = interaction.options.getRole('role');
        const lang = interaction.options.getString('lang') || 'en';

        // Check Permissions
        if (role.position >= interaction.guild.members.me.roles.highest.position) {
            return interaction.reply({ content: '❌ Error: Bot role must be higher than the target role!', ephemeral: true });
        }

        const uniqueState = `v_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Sync DB
        await VerifyState.create({
            state: uniqueState, guildId: interaction.guildId,
            channelId: channel.id, roleId: role.id, lang: lang
        });
        
        // Update Global Settings
        await GuildSettings.findOneAndUpdate({ guildId: interaction.guildId }, { lang, welcomeChannelId: channel.id }, { upsert: true });

        const vercelUrl = process.env.VERCEL_URL;
        const embed = new EmbedBuilder()
            .setTitle(lang === 'vi' ? 'Xác thực danh tính' : 'Identity Verification')
            .setDescription(lang === 'vi' ? 'Nhấn nút bên dưới để nhận quyền.' : 'Click below to get your role.')
            .setColor('#5865F2');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setLabel('Verify').setStyle(ButtonStyle.Link).setURL(`${vercelUrl}/pages/?state=${uniqueState}`)
        );

        await channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: '✅ Setup Complete!', ephemeral: true });
    }

    if (commandName === 'set-lang') {
        const lang = interaction.options.getString('language');
        await GuildSettings.findOneAndUpdate({ guildId: interaction.guildId }, { lang }, { upsert: true });
        await interaction.reply({ content: `✅ Language set to ${lang}`, ephemeral: true });
    }
});

// Smart Welcome Event
client.on('guildMemberAdd', async member => {
    // Check settings from DB (Sync logic)
    const settings = await GuildSettings.findOne({ guildId: member.guild.id });
    if (settings && settings.welcomeChannelId) {
        const channel = member.guild.channels.cache.get(settings.welcomeChannelId);
        if (channel) {
            const buffer = await welcomeCanvas(member);
            channel.send({ files: [ { attachment: buffer, name: 'welcome.png' } ] });
        }
    }
});

// --- API ENDPOINTS ---

// 1. Get Config for Frontend Sync
app.get('/api/config', async (req, res) => {
    const { state } = req.query;
    if (!state) return res.status(400).json({ error: 'Missing state' });
    
    const config = await VerifyState.findOne({ state });
    if (!config) return res.status(404).json({ error: 'Setup not found' });

    res.json({
        lang: config.lang,
        guildId: config.guildId,
        successPage: '/pages/success.html',
        errorPage: '/pages/error.html'
    });
});

// 2. Callback Endpoint
app.get('/auth/callback', async (req, res) => {
    const { code, state } = req.query;
    let redirectUrl = process.env.VERCEL_URL + '/pages/success.html'; // Default

    try {
        if (!state) throw new Error('NO_STATE');

        const config = await VerifyState.findOne({ state });
        if (!config) throw new Error('NO_SETUP');

        // Exchange Token
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

        // Add Role Logic
        const guild = await client.guilds.fetch(config.guildId);
        
        // Try fetch member
        let member;
        try {
            member = await guild.members.fetch(userId);
        } catch (e) {
            // User not in guild, use join endpoint
            await guild.members.add({ user: userId, accessToken: access_token, roles: [config.roleId] });
            redirectUrl = `${redirectUrl}?lang=${config.lang}`;
            return res.redirect(redirectUrl);
        }

        // If member exists, add role manually to catch hierarchy errors
        try {
            await member.roles.add(config.roleId);
        } catch (err) {
            // LỖI QUAN TRỌNG: Role Hierarchy
            console.error("Role Hierarchy Error:", err);
            // Redirect to Error Page with code
            redirectUrl = `${process.env.VERCEL_URL}/pages/error.html?error=hierarchy&lang=${config.lang}`;
            return res.redirect(redirectUrl);
        }

        redirectUrl = `${redirectUrl}?lang=${config.lang}`;
        res.redirect(redirectUrl);

    } catch (error) {
        console.error("Callback Error:", error.message);
        let errorCode = 'unknown';
        if (error.message === 'NO_STATE' || error.message === 'NO_SETUP') errorCode = 'no_setup';
        
        res.redirect(`${process.env.VERCEL_URL}/pages/error.html?error=${errorCode}`);
    }
});

app.listen(process.env.PORT || 3000, () => console.log('🚀 Server Running'));
client.login(process.env.TOKEN);
