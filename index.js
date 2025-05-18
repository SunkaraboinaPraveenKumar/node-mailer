// index.js - Enhanced Express server with better error handling and validation
const express = require('express');
const nodemailer = require('nodemailer');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
require('dotenv').config(); // For loading environment variables

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Configure multer for file uploads with better validation
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    // Create the uploads directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Create unique filename with original extension
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const fileExt = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + fileExt);
  }
});

const fileFilter = (req, file, cb) => {
  // Accept only specific file types
  const allowedTypes = ['.jpg', '.jpeg', '.png', '.pdf', '.doc', '.docx'];
  const fileExt = path.extname(file.originalname).toLowerCase();

  if (allowedTypes.includes(fileExt)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPG, PNG, PDF, and DOC files are allowed.'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: fileFilter
});

// Email configuration validation
if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
  console.error('Warning: EMAIL_USER or EMAIL_PASSWORD not set in environment variables');
}

// Configure nodemailer with primary and fallback options
const createTransporter = () => {
  // Primary configuration
  return nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || 'gmail',
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT || 465,
    secure: process.env.EMAIL_SECURE !== 'false', // Default to true if not specified
    auth: {
      user: process.env.EMAIL_USER || 'your-email@gmail.com',
      pass: process.env.EMAIL_PASSWORD || 'your-app-password'
    },
    tls: {
      rejectUnauthorized: process.env.NODE_ENV === 'production' // Only enforce in production
    }
  });
};

// Fallback transporter with alternative settings
const createFallbackTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: 587, // Alternative port
    secure: false, // Use TLS instead of SSL
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD
    },
    tls: {
      rejectUnauthorized: false
    }
  });
};

// Validation helpers
const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const validatePhone = (phone) => {
  // Basic phone validation (adjust as needed for your country/region)
  if (!phone) return true; // Phone can be optional
  const phoneRegex = /^\+?[0-9\s-]{8,15}$/;
  return phoneRegex.test(phone);
};

// Route to handle form submission with improved validation and error handling
app.post('/submit-contact-form', upload.single('file'), async (req, res) => {
  try {
    const {
      Name, Email, Subject, Message
    } = req.body;

    // Validation
    if (!Name || !Email) {
      return res.status(400).json({
        success: false,
        message: 'Name and email are required fields.'
      });
    }

    // Email validation
    if (!validateEmail(Email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address.'
      });
    }

    // Phone validation (using Subject field for phone number)
    if (Subject && !validatePhone(Subject)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid phone number.'
      });
    }

    // Create email content with sanitized inputs
    const mailOptions = {
      from: 'kumarsunkaraboina27@gmail.com',
      to: 'kumarsunkaraboina27@gmail.com',
      replyTo: Email,
      subject: `New Contact Form Submission from ${Name}`,
      text: `
New Contact Form Submission

Personal Details:
Name: ${Name}
Email: ${Email}
Phone: ${Subject || 'Not provided'}

Message:
${Message || 'No message provided.'}
      `,
      html: `
        <h2>New Contact Form Submission</h2>
        <h3>Personal Details:</h3>
        <p><strong>Name:</strong> ${Name}</p>
        <p><strong>Email:</strong> ${Email}</p>
        <p><strong>Phone:</strong> ${Subject || 'Not provided'}</p>
        
        <h3>Message:</h3>
        <p>${Message ? Message.replace(/\n/g, '<br>') : 'No message provided.'}</p>
      `
    };

    // Add attachment if file was uploaded
    if (req.file) {
      mailOptions.attachments = [{
        filename: req.file.originalname,
        path: req.file.path
      }];
    }

    // Send email with better error handling and fallback
    let emailSent = false;
    let emailError = null;

    try {
      // Try primary transporter first
      const transporter = createTransporter();
      const info = await transporter.sendMail(mailOptions);
      console.log('Message sent: %s', info.messageId);
      emailSent = true;
    } catch (primaryError) {
      console.error('Primary email configuration failed:', primaryError);
      emailError = primaryError;

      try {
        // Try fallback configuration
        const fallbackTransporter = createFallbackTransporter();
        const fallbackInfo = await fallbackTransporter.sendMail(mailOptions);
        console.log('Message sent with fallback: %s', fallbackInfo.messageId);
        emailSent = true;
      } catch (fallbackError) {
        console.error('Fallback email configuration also failed:', fallbackError);
        emailError = fallbackError;
      }
    }

    // Clean up uploaded file after sending regardless of email success
    if (req.file) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error('Error removing file:', err);
      });
    }

    if (emailSent) {
      return res.redirect('/thank-you.html');
    } else {
      // Log detailed error but return generic message to user
      console.error('All email sending attempts failed:', emailError);
      return res.redirect('/error.html');
    }
  } catch (error) {
    console.error('Error processing form submission:', error);

    // Clean up uploaded file in case of error
    if (req.file) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error('Error removing file:', err);
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Something went wrong. Please try again later.'
    });
  }
});


app.post('/subscribe', async (req, res) => {
  const { email } = req.body;

  if (!email || !validateEmail(email)) {
    return res.status(400).json({
      success: false,
      message: 'Please provide a valid email address.'
    });
  }

  const mailOptions = {
    from: 'yourgmail@gmail.com',
    to: 'yourgmail@gmail.com',
    subject: `New Email Subscription`,
    text: `A new user subscribed with email: ${email}`,
    html: `<p><strong>New Subscriber Email:</strong> ${email}</p>`
  };

  try {
    const transporter = createTransporter();
    const info = await transporter.sendMail(mailOptions);

    console.log('Subscription email sent:', info.messageId);
    return res.redirect('/thank-you.html');
  } catch (error) {
    console.error('Error sending subscription email:', error);
    return res.redirect('/error.html');
  }
});



// Add this route to your existing index.js file

// Route for JSON submissions with file encoded as base64
app.post(
  '/submit-quote-form',
  upload.single('attachment'),
  async (req, res) => {
    try {
      // 2a. Destructure ALL fields, including bestTime
      const {
        name, email, phone, city, address,
        propertyType, projectType, numWindows, budget,
        comments, contactMethod, bestTime,
        windowType, glazing
      } = req.body;

      // 2b. Basic validation
      if (!name || !email) {
        return res.status(400).json({
          success: false,
          message: 'Name and email are required fields.'
        });
      }
      if (!validateEmail(email)) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a valid email address.'
        });
      }

      // 2c. Format array fields
      const windowTypes = Array.isArray(windowType)
        ? windowType.join(', ')
        : (windowType || 'None selected');
      const glazingOptions = Array.isArray(glazing)
        ? glazing.join(', ')
        : (glazing || 'None selected');

      // 2d. Build mailOptions
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: process.env.RECIPIENT_EMAIL,
        replyTo: email,
        subject: `New Quote Request from ${name}`,
        text: `
New Quote Request

Personal Details:
Name: ${name}
Email: ${email}
Phone: ${phone || 'Not provided'}
City: ${city || 'Not provided'}
Address: ${address || 'Not provided'}

Project Details:
Property Type: ${propertyType || 'Not specified'}
Project Type: ${projectType || 'Not specified'}
Window Types: ${windowTypes}
Glazing Options: ${glazingOptions}
Number of Windows: ${numWindows || 'Not specified'}
Budget: ${budget || 'Not provided'}

Contact Preferences:
Method: ${contactMethod || 'Not specified'}
Best Time to Reach: ${bestTime || 'Not specified'}

Comments:
${comments || 'None'}
        `,
        html: `
          <h2>New Window Quote Request</h2>
          <h3>Personal Details</h3>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Phone:</strong> ${phone || 'Not provided'}</p>
          <p><strong>City:</strong> ${city || 'Not provided'}</p>
          <p><strong>Address:</strong> ${address || 'Not provided'}</p>

          <h3>Project Details</h3>
          <p><strong>Property Type:</strong> ${propertyType || 'Not specified'}</p>
          <p><strong>Project Type:</strong> ${projectType || 'Not specified'}</p>
          <p><strong>Window Types:</strong> ${windowTypes}</p>
          <p><strong>Glazing Options:</strong> ${glazingOptions}</p>
          <p><strong>Number of Windows:</strong> ${numWindows || 'Not specified'}</p>
          <p><strong>Budget:</strong> ${budget || 'Not provided'}</p>

          <h3>Contact Preferences</h3>
          <p><strong>Method:</strong> ${contactMethod || 'Not specified'}</p>
          <p><strong>Best Time to Reach:</strong> ${bestTime || 'Not specified'}</p>

          <h3>Comments</h3>
          <p>${comments ? comments.replace(/\n/g, '<br>') : 'None'}</p>
        `
      };

      // 2e. Attach file if uploaded
      if (req.file) {
        mailOptions.attachments = [{
          filename: req.file.originalname,
          path: req.file.path
        }];
      }

      // 2f. Send email (primary + fallback)
      let emailSent = false;
      let lastError = null;

      try {
        const transporter = createTransporter();
        await transporter.sendMail(mailOptions);
        emailSent = true;
      } catch (err) {
        lastError = err;
        console.error('Primary SMTP failed:', err);
        try {
          const fallback = createFallbackTransporter();
          await fallback.sendMail(mailOptions);
          emailSent = true;
        } catch (err2) {
          lastError = err2;
          console.error('Fallback SMTP failed:', err2);
        }
      }

      // 2g. Cleanup uploaded file
      if (req.file) {
        fs.unlink(req.file.path, (unlinkErr) => {
          if (unlinkErr) console.error('Cleanup failed:', unlinkErr);
        });
      }

      // 2h. Final response
      if (emailSent) {
        return res.redirect('/thank-you.html');
      } else {
        return res.redirect('/error.html');
      }

    } catch (error) {
      console.error('Handler error:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error. Please try again later.'
      });
    }
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Start server with error handling
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Handle server errors
server.on('error', (error) => {
  console.error('Server error:', error);
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Please try a different port.`);
    process.exit(1);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });

  // Force close if graceful shutdown takes too long
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
});

module.exports = app; // Export for testing