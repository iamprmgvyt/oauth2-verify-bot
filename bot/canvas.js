const { createCanvas, loadImage } = require('canvas');

module.exports = async (member) => {
    const canvas = createCanvas(800, 300);
    const ctx = canvas.getContext('2d');

    // Background (Gradient Synapse màu xanh dương đậm)
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
    gradient.addColorStop(0, '#0F172A'); // Slate 900
    gradient.addColorStop(1, '#3B82F6'); // Blue 500
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Vẽ họa tiết trang trí (Hình tròn mờ)
    ctx.beginPath();
    ctx.arc(700, 50, 100, 0, Math.PI * 2, true);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.fill();

    // Tải Avatar
    try {
        const avatar = await loadImage(member.user.displayAvatarURL({ format: 'png', size: 128 }));
        
        // Vẽ Avatar hình tròn
        ctx.beginPath();
        ctx.arc(150, 150, 80, 0, Math.PI * 2, true);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(avatar, 70, 70, 160, 160);
        
        // Viền Avatar
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 8;
        ctx.stroke();
    } catch (e) {
        console.log("Error loading avatar");
    }

    // Text Welcome
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 50px Inter, sans-serif';
    ctx.fillText('WELCOME', 300, 100);

    ctx.font = 'bold 35px Inter, sans-serif';
    ctx.fillText(member.user.tag, 300, 160);

    ctx.font = '20px Inter, sans-serif';
    ctx.fillStyle = '#cbd5e1'; // Slate 300
    ctx.fillText(`Joined Synapse Pass Secure Server`, 300, 200);
    ctx.font = 'italic 18px Inter, sans-serif';
    ctx.fillText(`Member #${member.guild.memberCount}`, 300, 235);

    // Watermark
    ctx.font = '12px Inter, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillText('Protected by Synapse Pass', 650, 280);

    return canvas.toBuffer();
};
