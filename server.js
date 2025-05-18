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
app.post('/submit-form', upload.single('file'), async (req, res) => {
    try {
        const {
            name, email, phone, city, address,
            propertyType, projectType, numWindows, budget,
            comments, contactMethod
        } = req.body;

        // Validation
        if (!name || !email) {
            return res.status(400).json({
                success: false,
                message: 'Name and email are required fields.'
            });
        }

        // Email validation
        if (!validateEmail(email)) {
            return res.status(400).json({
                success: false,
                message: 'Please provide a valid email address.'
            });
        }

        // Phone validation
        if (phone && !validatePhone(phone)) {
            return res.status(400).json({
                success: false,
                message: 'Please provide a valid phone number.'
            });
        }

        // Get selected window types (comes as array or single value)
        const windowTypes = Array.isArray(req.body.windowType)
            ? req.body.windowType.join(', ')
            : req.body.windowType || 'None selected';

        // Get selected glazing options (comes as array or single value)
        const glazingOptions = Array.isArray(req.body.glazing)
            ? req.body.glazing.join(', ')
            : req.body.glazing || 'None selected';

        // Create email content with sanitized inputs
        const mailOptions = {
            from: 'kumarsunkaraboina27@gmail.com',
            to: 'kumarsunkaraboina27@gmail.com',
            replyTo: email,
            subject: `New Window Quote Request from ${name}`,
            text: `
New Quote Request - My Home Interiors

Personal Details:
Name: ${name}
Email: ${email}
Phone: ${phone || 'Not provided'}
City/Location: ${city || 'Not provided'}
Address: ${address || 'Not provided'}

Project Details:
Property Type: ${propertyType || 'Not specified'}
Project Type: ${projectType || 'Not specified'}
Window Types Required: ${windowTypes}
Glazing Options Preferred: ${glazingOptions}
Number of Windows: ${numWindows || 'Not specified'}
Estimated Budget: ${budget || 'Not provided'}

Contact Preferences:
Preferred Contact Method: ${contactMethod || 'Not specified'}

Additional Comments:
${comments || 'No additional comments provided.'}
      `,
            html: `
        <h2>New Quote Request - My Home Interiors</h2>
        <h3>Personal Details:</h3>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${phone || 'Not provided'}</p>
        <p><strong>City/Location:</strong> ${city || 'Not provided'}</p>
        <p><strong>Address:</strong> ${address || 'Not provided'}</p>
        
        <h3>Project Details:</h3>
        <p><strong>Property Type:</strong> ${propertyType || 'Not specified'}</p>
        <p><strong>Project Type:</strong> ${projectType || 'Not specified'}</p>
        <p><strong>Window Types Required:</strong> ${windowTypes}</p>
        <p><strong>Glazing Options Preferred:</strong> ${glazingOptions}</p>
        <p><strong>Number of Windows:</strong> ${numWindows || 'Not specified'}</p>
        <p><strong>Estimated Budget:</strong> ${budget || 'Not provided'}</p>
        
        <h3>Contact Preferences:</h3>
        <p><strong>Preferred Contact Method:</strong> ${contactMethod || 'Not specified'}</p>
        
        <h3>Additional Comments:</h3>
        <p>${comments ? comments.replace(/\n/g, '<br>') : 'No additional comments provided.'}</p>
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
            return res.status(200).json({
                success: true,
                message: 'Thank you for your request. We will get back to you shortly!'
            });
        } else {
            // Log detailed error but return generic message to user
            console.error('All email sending attempts failed:', emailError);
            return res.status(500).json({
                success: false,
                message: 'We encountered an issue sending your request. Please try again or contact us directly.'
            });
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



// Add this route to your existing index.js file

// Route for JSON submissions with file encoded as base64
app.post('/submit-form/multipart', async (req, res) => {
  try {
    const { 
      name, email, phone, city, address,
      propertyType, projectType, numWindows, budget,
      comments, contactMethod, windowType, glazing,
      // File data in JSON request
      fileData, fileName, fileType
    } = req.body;

    // Validation
    if (!name || !email) {
      return res.status(400).json({ 
        success: false, 
        message: 'Name and email are required fields.' 
      });
    }

    // Email validation
    if (!validateEmail(email)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Please provide a valid email address.' 
      });
    }

    // Handle file if provided in base64 format
    let filePath = null;
    if (fileData && fileName) {
      // Get file extension
      const fileExt = path.extname(fileName).toLowerCase();
      
      // Validate file type
      const allowedTypes = ['.jpg', '.jpeg', '.png', '.pdf', '.doc', '.docx'];
      if (!allowedTypes.includes(fileExt)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid file type. Only JPG, PNG, PDF, and DOC files are allowed.'
        });
      }
      
      // Ensure uploads directory exists
      const uploadDir = path.join(__dirname, 'uploads');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      
      // Create unique filename
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const uniqueFileName = 'file-' + uniqueSuffix + fileExt;
      filePath = path.join(uploadDir, uniqueFileName);
      
      // Remove the base64 header if present
      const base64Data = fileData.replace(/^data:([A-Za-z-+/]+);base64,/, '');
      
      // Write file to disk
      fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
    }

    // Format arrays consistently
    const windowTypes = Array.isArray(windowType) 
      ? windowType.join(', ') 
      : windowType || 'None selected';

    const glazingOptions = Array.isArray(glazing) 
      ? glazing.join(', ') 
      : glazing || 'None selected';

    // Create email options
    const mailOptions = {
      from: process.env.EMAIL_USER || 'your-email@gmail.com',
      to: process.env.RECIPIENT_EMAIL || 'recipient-email@example.com',
      replyTo: email,
      subject: `New Window Quote Request from ${name} (JSON Submission)`,
      text: `
New Quote Request - My Home Interiors

Personal Details:
Name: ${name}
Email: ${email}
Phone: ${phone || 'Not provided'}
City/Location: ${city || 'Not provided'}
Address: ${address || 'Not provided'}

Project Details:
Property Type: ${propertyType || 'Not specified'}
Project Type: ${projectType || 'Not specified'}
Window Types Required: ${windowTypes}
Glazing Options Preferred: ${glazingOptions}
Number of Windows: ${numWindows || 'Not specified'}
Estimated Budget: ${budget || 'Not provided'}

Contact Preferences:
Preferred Contact Method: ${contactMethod || 'Not specified'}

Additional Comments:
${comments || 'No additional comments provided.'}
      `,
      html: `
        <h2>New Quote Request - My Home Interiors</h2>
        <h3>Personal Details:</h3>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${phone || 'Not provided'}</p>
        <p><strong>City/Location:</strong> ${city || 'Not provided'}</p>
        <p><strong>Address:</strong> ${address || 'Not provided'}</p>
        
        <h3>Project Details:</h3>
        <p><strong>Property Type:</strong> ${propertyType || 'Not specified'}</p>
        <p><strong>Project Type:</strong> ${projectType || 'Not specified'}</p>
        <p><strong>Window Types Required:</strong> ${windowTypes}</p>
        <p><strong>Glazing Options Preferred:</strong> ${glazingOptions}</p>
        <p><strong>Number of Windows:</strong> ${numWindows || 'Not specified'}</p>
        <p><strong>Estimated Budget:</strong> ${budget || 'Not provided'}</p>
        
        <h3>Contact Preferences:</h3>
        <p><strong>Preferred Contact Method:</strong> ${contactMethod || 'Not specified'}</p>
        
        <h3>Additional Comments:</h3>
        <p>${comments ? comments.replace(/\n/g, '<br>') : 'No additional comments provided.'}</p>
        
        <p><em>Submitted via JSON API</em></p>
      `
    };

    // Add attachment if file was uploaded
    if (filePath && fileName) {
      mailOptions.attachments = [{
        filename: fileName,
        path: filePath
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
    if (filePath) {
      fs.unlink(filePath, (err) => {
        if (err) console.error('Error removing file:', err);
      });
    }

    if (emailSent) {
      return res.status(200).json({ 
        success: true, 
        message: 'Thank you for your request. We will get back to you shortly!' 
      });
    } else {
      // Log detailed error but return generic message to user
      console.error('All email sending attempts failed:', emailError);
      return res.status(500).json({ 
        success: false, 
        message: 'We encountered an issue sending your request. Please try again or contact us directly.' 
      });
    }
  } catch (error) {
    console.error('Error processing JSON form submission:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Something went wrong. Please try again later.' 
    });
  }
});

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