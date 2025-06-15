from flask import Flask, render_template, request, redirect, url_for, flash, jsonify, session
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, timezone, timedelta
import os
from twilio.rest import Client
import secrets

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key-here-change-this'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///crime_reports.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Twilio configuration - Load from environment variables or use defaults for testing
app.config['TWILIO_ACCOUNT_SID'] = os.getenv('TWILIO_ACCOUNT_SID', 'your_twilio_account_sid_here')
app.config['TWILIO_AUTH_TOKEN'] = os.getenv('TWILIO_AUTH_TOKEN', 'your_twilio_auth_token_here')
app.config['TWILIO_PHONE_NUMBER'] = os.getenv('TWILIO_PHONE_NUMBER', 'your_twilio_phone_number_here')

# For development - set to True to simulate SMS without Twilio
SIMULATE_SMS = os.getenv('SIMULATE_SMS', 'True').lower() == 'true'

# Indian Standard Time (IST) timezone
IST = timezone(timedelta(hours=5, minutes=30))

db = SQLAlchemy(app)
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'admin_login'

# Initialize Twilio client
try:
    if not SIMULATE_SMS and app.config['TWILIO_ACCOUNT_SID'] != 'your_twilio_account_sid_here':
        twilio_client = Client(app.config['TWILIO_ACCOUNT_SID'], app.config['TWILIO_AUTH_TOKEN'])
        print("✅ Twilio SMS enabled")
    else:
        twilio_client = None
        print("📱 SMS simulation mode enabled (no actual SMS will be sent)")
except Exception as e:
    twilio_client = None
    print(f"⚠️  Twilio configuration error: {e}")
    print("📱 SMS simulation mode enabled")

# Helper function to get current IST time
def get_ist_now():
    return datetime.now(IST)

# Helper function to convert UTC to IST for display
def utc_to_ist(utc_datetime):
    if utc_datetime is None:
        return None
    if utc_datetime.tzinfo is None:
        # Assume it's UTC if no timezone info
        utc_datetime = utc_datetime.replace(tzinfo=timezone.utc)
    return utc_datetime.astimezone(IST)

# Template filter for IST conversion
@app.template_filter('ist')
def ist_filter(utc_datetime):
    ist_time = utc_to_ist(utc_datetime)
    return ist_time if ist_time else utc_datetime

# Models
class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(120), nullable=False)
    is_admin = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    
    def set_password(self, password):
        self.password_hash = generate_password_hash(password)
    
    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

class CrimeType(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    severity = db.Column(db.String(20), default='medium')  # low, medium, high, urgent
    description = db.Column(db.Text)
    
class CrimeReport(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, nullable=False)
    crime_type = db.Column(db.String(100), nullable=False)
    incident_date = db.Column(db.DateTime, nullable=False)
    latitude = db.Column(db.Float, nullable=False)
    longitude = db.Column(db.Float, nullable=False)
    address = db.Column(db.String(300), nullable=False)
    landmark = db.Column(db.String(200))
    reporter_name = db.Column(db.String(100), nullable=False)
    reporter_phone = db.Column(db.String(20), nullable=False)
    reporter_email = db.Column(db.String(100))
    is_anonymous = db.Column(db.Boolean, default=False)
    witnesses = db.Column(db.Text)
    evidence_description = db.Column(db.Text)
    priority = db.Column(db.String(20), default='medium')  # low, medium, high, urgent
    status = db.Column(db.String(20), default='pending')  # pending, verified, rejected, investigating
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    verified_at = db.Column(db.DateTime)
    verified_by = db.Column(db.Integer, db.ForeignKey('user.id'))
    admin_notes = db.Column(db.Text)
    
    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'description': self.description,
            'crime_type': self.crime_type,
            'latitude': self.latitude,
            'longitude': self.longitude,
            'address': self.address,
            'status': self.status,
            'priority': self.priority,
            'created_at': self.created_at.isoformat(),
            'verified_at': self.verified_at.isoformat() if self.verified_at else None
        }

class SMSLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    phone_number = db.Column(db.String(20), nullable=False)
    message = db.Column(db.Text, nullable=False)
    status = db.Column(db.String(20), default='sent')  # sent, failed, pending
    crime_report_id = db.Column(db.Integer, db.ForeignKey('crime_report.id'))
    sent_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    twilio_sid = db.Column(db.String(100))

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

def send_sms(phone_number, message, crime_report_id=None):
    # Ensure phone number has +91 prefix for Indian numbers
    if not phone_number.startswith('+'):
        if phone_number.startswith('91'):
            phone_number = '+' + phone_number
        else:
            phone_number = '+91' + phone_number.replace(' ', '').replace('-', '')
    
    # Log SMS attempt
    sms_log = SMSLog(
        phone_number=phone_number,
        message=message,
        crime_report_id=crime_report_id,
        status='pending'
    )
    
    if not twilio_client or SIMULATE_SMS:
        print(f"\n📱 SMS SIMULATION:")
        print(f"To: {phone_number}")
        print(f"Message: {message}")
        print("-" * 50)
        sms_log.status = 'simulated'
        db.session.add(sms_log)
        db.session.commit()
        return True
    
    try:
        twilio_message = twilio_client.messages.create(
            body=message,
            from_=app.config['TWILIO_PHONE_NUMBER'],
            to=phone_number
        )
        sms_log.status = 'sent'
        sms_log.twilio_sid = twilio_message.sid
        db.session.add(sms_log)
        db.session.commit()
        print(f"✅ SMS sent successfully to {phone_number}")
        return True
    except Exception as e:
        print(f"❌ SMS Error: {e}")
        sms_log.status = 'failed'
        db.session.add(sms_log)
        db.session.commit()
        return False

# Routes
@app.route('/')
def index():
    return redirect(url_for('report_crime'))

@app.route('/report', methods=['GET', 'POST'])
def report_crime():
    if request.method == 'POST':
        try:
            # Use current IST time for incident since we removed those fields
            incident_datetime = get_ist_now()
            
            # Set reporter name based on anonymous checkbox
            is_anonymous = True  # Always anonymous
            reporter_name = "Anonymous Reporter"
            
            # Format phone number for Indian format
            phone_number = request.form['reporter_phone'].replace(' ', '').replace('-', '')
            if not phone_number.startswith('+91'):
                if phone_number.startswith('91'):
                    phone_number = '+' + phone_number
                else:
                    phone_number = '+91' + phone_number
            
            report = CrimeReport(
                title=request.form['title'],
                description=request.form['description'],
                crime_type=request.form['crime_type'],
                incident_date=incident_datetime,
                latitude=float(request.form['latitude']),
                longitude=float(request.form['longitude']),
                address=request.form['address'],
                landmark='',  # Empty since we removed this field
                reporter_name=reporter_name,
                reporter_phone=phone_number,
                reporter_email='',  # Empty since we removed this field
                is_anonymous=is_anonymous,
                witnesses='',  # Empty since we removed this field
                evidence_description='',  # Empty since we removed this field
                priority='medium'  # Default priority
            )
            
            db.session.add(report)
            db.session.commit()
            
            # Send SMS confirmation
            sms_message = f"Crime alert submitted successfully. Report ID: {report.id}. We will notify you once verified."
            send_sms(report.reporter_phone, sms_message, report.id)
            
            flash('Crime alert submitted successfully!', 'success')
            return redirect(url_for('index'))
            
        except Exception as e:
            flash('Error submitting report. Please try again.', 'error')
            print(f"Error: {e}")
    
    return render_template('report.html')

@app.route('/feed')
@login_required
def crime_feed():
    # Restrict to admin users only
    if not current_user.is_admin:
        flash('Access denied. Admin privileges required.', 'error')
        return redirect(url_for('admin_login'))
    
    page = request.args.get('page', 1, type=int)
    per_page = 10
    
    verified_reports = CrimeReport.query.filter(CrimeReport.status.in_(['verified', 'investigating']))\
        .order_by(CrimeReport.created_at.desc())\
        .paginate(page=page, per_page=per_page, error_out=False)
    
    return render_template('feed.html', reports=verified_reports)

@app.route('/map')
def crime_map():
    return render_template('map.html')

@app.route('/api/crimes')
def api_crimes():
    verified_reports = CrimeReport.query.filter(CrimeReport.status.in_(['verified', 'investigating'])).all()
    return jsonify([report.to_dict() for report in verified_reports])

@app.route('/admin/login', methods=['GET', 'POST'])
def admin_login():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        user = User.query.filter_by(username=username).first()
        
        if user and user.check_password(password) and user.is_admin:
            login_user(user)
            return redirect(url_for('admin_dashboard'))
        else:
            flash('Invalid credentials or insufficient permissions', 'error')
    
    return render_template('admin_login.html')

@app.route('/admin/logout')
@login_required
def admin_logout():
    logout_user()
    return redirect(url_for('index'))

@app.route('/admin')
@login_required
def admin_dashboard():
    if not current_user.is_admin:
        flash('Access denied', 'error')
        return redirect(url_for('index'))
    
    page = request.args.get('page', 1, type=int)
    status_filter = request.args.get('status', 'pending')
    
    query = CrimeReport.query
    
    if status_filter:
        query = query.filter_by(status=status_filter)
    
    reports = query.order_by(CrimeReport.created_at.desc())\
        .paginate(page=page, per_page=10, error_out=False)
    
    return render_template('admin_dashboard.html', reports=reports, current_status=status_filter)

@app.route('/admin/report/<int:report_id>')
@login_required
def admin_report_detail(report_id):
    if not current_user.is_admin:
        flash('Access denied', 'error')
        return redirect(url_for('index'))
    
    report = CrimeReport.query.get_or_404(report_id)
    sms_logs = SMSLog.query.filter_by(crime_report_id=report_id).order_by(SMSLog.sent_at.desc()).all()
    
    return render_template('admin_report_detail.html', report=report, sms_logs=sms_logs)

@app.route('/admin/verify/<int:report_id>')
@login_required
def verify_report(report_id):
    if not current_user.is_admin:
        flash('Access denied', 'error')
        return redirect(url_for('index'))
    
    report = CrimeReport.query.get_or_404(report_id)
    report.verified_at = datetime.now(timezone.utc)
    report.verified_by = current_user.id
    
    # Check if investigation should be started
    investigation = request.args.get('investigation', 'false').lower() == 'true'
    if investigation:
        report.status = 'investigating'
        report.admin_notes = 'Investigation started'
    else:
        report.status = 'verified'
    
    db.session.commit()
    
    # Send SMS notification
    if investigation:
        sms_message = f"Your crime report (ID: {report.id}) has been verified and is under investigation. We will keep you updated."
    else:
        sms_message = f"Your crime report (ID: {report.id}) has been verified by authorities. Thank you for helping keep our community safe."
    
    send_sms(report.reporter_phone, sms_message, report.id)
    
    status_msg = 'Report verified and investigation started!' if investigation else 'Report verified successfully!'
    flash(status_msg, 'success')
    return redirect(url_for('admin_dashboard'))

@app.route('/admin/reject/<int:report_id>')
@login_required
def reject_report(report_id):
    if not current_user.is_admin:
        flash('Access denied', 'error')
        return redirect(url_for('index'))
    
    report = CrimeReport.query.get_or_404(report_id)
    report.status = 'rejected'
    
    db.session.commit()
    
    # Send SMS warning
    sms_message = f"Your crime report (ID: {report.id}) has been rejected. Please ensure all information is accurate. False reports may result in legal action."
    send_sms(report.reporter_phone, sms_message, report.id)
    
    flash('Report rejected!', 'warning')
    return redirect(url_for('admin_dashboard'))

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
        
        # Create admin user if doesn't exist
        admin = User.query.filter_by(username='admin').first()
        if not admin:
            admin = User(username='admin', is_admin=True)
            admin.set_password('admin123')  # Change this password!
            db.session.add(admin)
            db.session.commit()
            print("Admin user created: admin/admin123")
        
        # Create default crime types
        if not CrimeType.query.first():
            crime_types = [
                CrimeType(name='theft', severity='medium', description='Theft and burglary'),
                CrimeType(name='assault', severity='high', description='Physical assault'),
                CrimeType(name='vandalism', severity='low', description='Property damage'),
                CrimeType(name='drug_related', severity='medium', description='Drug-related crimes'),
                CrimeType(name='fraud', severity='medium', description='Financial fraud'),
                CrimeType(name='domestic_violence', severity='urgent', description='Domestic violence'),
                CrimeType(name='other', severity='medium', description='Other crimes')
            ]
            
            for crime_type in crime_types:
                db.session.add(crime_type)
            
            db.session.commit()
            print("Default crime types created")
    
    app.run(debug=True, host="0.0.0.0")
