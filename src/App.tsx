/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, FormEvent } from 'react';
import { 
  Phone, 
  Mail, 
  MapPin, 
  Clock, 
  Droplets, 
  Wrench, 
  ShieldCheck, 
  Star, 
  ChevronRight, 
  Menu, 
  X,
  CheckCircle2,
  ArrowRight,
  Instagram,
  Facebook,
  Twitter,
  User as UserIcon,
  LogOut,
  Calendar
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db, googleProvider, signInWithPopup, signOut, onAuthStateChanged, User } from './firebase';
import { collection, addDoc, query, where, onSnapshot, serverTimestamp, doc, setDoc, getDocFromServer } from 'firebase/firestore';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo?: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: any;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "Something went wrong.";
      try {
        const parsed = JSON.parse(this.state.error.message);
        if (parsed.error) errorMessage = `Database Error: ${parsed.error}`;
      } catch (e) {
        errorMessage = this.state.error.message || errorMessage;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-blue-50 p-4">
          <div className="bg-white p-8 rounded-[40px] shadow-2xl max-w-md w-full text-center border-2 border-blue-100">
            <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <X className="w-10 h-10 text-red-500" />
            </div>
            <h2 className="text-2xl font-bold text-blue-950 mb-4">Application Error</h2>
            <p className="text-blue-900/60 mb-8">{errorMessage}</p>
            <button 
              onClick={() => window.location.reload()}
              className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-700 transition-all"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const services = [
  {
    title: "Emergency Repairs",
    description: "24/7 rapid response for burst pipes, major leaks, and urgent plumbing failures.",
    icon: <Droplets className="w-10 h-10" />,
  },
  {
    title: "Installation",
    description: "Professional installation of fixtures, water heaters, and complete piping systems.",
    icon: <Wrench className="w-10 h-10" />,
  },
  {
    title: "Maintenance",
    description: "Preventative checks and cleaning to keep your plumbing system running smoothly.",
    icon: <ShieldCheck className="w-10 h-10" />,
  },
];

const testimonials = [
  {
    name: "Sarah Johnson",
    role: "Homeowner",
    content: "FlowMaster saved us during a midnight pipe burst. They arrived in 20 minutes and fixed everything perfectly.",
    rating: 5
  },
  {
    name: "Michael Chen",
    role: "Property Manager",
    content: "Reliable, professional, and fair pricing. I use them for all my commercial properties.",
    rating: 5
  },
  {
    name: "Emma Williams",
    role: "Homeowner",
    content: "Best plumbing service I've ever used. Very clean work and explained everything clearly.",
    rating: 5
  }
];

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [formStatus, setFormStatus] = useState<'idle' | 'submitting' | 'success'>('idle');
  const [user, setUser] = useState<User | null>(null);
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
      setLoading(false);
      
      if (currentUser) {
        // Sync user profile
        try {
          const userRef = doc(db, 'users', currentUser.uid);
          await setDoc(userRef, {
            uid: currentUser.uid,
            displayName: currentUser.displayName,
            email: currentUser.email,
            photoURL: currentUser.photoURL,
            updatedAt: serverTimestamp()
          }, { merge: true });
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, `users/${currentUser.uid}`);
        }

        // Listen to bookings
        const q = query(collection(db, 'bookings'), where('uid', '==', currentUser.uid));
        const unsubBookings = onSnapshot(q, (snapshot) => {
          setBookings(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }, (error) => {
          handleFirestoreError(error, OperationType.GET, 'bookings');
        });
        return () => unsubBookings();
      } else {
        setBookings([]);
      }
    });

    // Test connection
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    };
    testConnection();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      unsubscribe();
    };
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login Error:", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout Error:", error);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) {
      alert("Please login to book a service.");
      return;
    }

    setFormStatus('submitting');
    const formData = new FormData(e.currentTarget as HTMLFormElement);
    
    try {
      await addDoc(collection(db, 'bookings'), {
        uid: user.uid,
        serviceType: formData.get('serviceType'),
        message: formData.get('message'),
        status: 'pending',
        createdAt: serverTimestamp()
      });
      setFormStatus('success');
      setTimeout(() => setFormStatus('idle'), 5000);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'bookings');
      setFormStatus('idle');
      alert("Failed to send booking. Please try again.");
    }
  };

  if (loading || !isAuthReady) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-white">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Navigation */}
      <nav className={`fixed w-full z-50 transition-all duration-300 ${scrolled ? 'bg-white shadow-md py-3' : 'bg-transparent py-5'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-2 rounded-lg">
              <Droplets className="w-6 h-6 text-white" />
            </div>
            <span className={`text-2xl font-bold tracking-tight ${scrolled ? 'text-blue-600' : 'text-white'}`}>
              FlowMaster
            </span>
          </div>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-8">
            {['Services', 'About', 'Testimonials', 'Contact'].map((item) => (
              <a 
                key={item} 
                href={`#${item.toLowerCase()}`}
                className={`font-medium hover:text-blue-500 transition-colors ${scrolled ? 'text-blue-900' : 'text-white/90'}`}
              >
                {item}
              </a>
            ))}
            
            {user ? (
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <img src={user.photoURL || ''} alt="User" className="w-8 h-8 rounded-full border border-blue-200" referrerPolicy="no-referrer" />
                  <span className={`text-sm font-bold ${scrolled ? 'text-blue-900' : 'text-white'}`}>{user.displayName?.split(' ')[0]}</span>
                </div>
                <button 
                  onClick={handleLogout}
                  className="text-sm font-bold text-red-500 hover:text-red-600 flex items-center gap-1"
                >
                  <LogOut className="w-4 h-4" />
                  Logout
                </button>
              </div>
            ) : (
              <button 
                onClick={handleLogin}
                className={`font-bold flex items-center gap-2 px-4 py-2 rounded-lg border-2 transition-all ${scrolled ? 'border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white' : 'border-white text-white hover:bg-white hover:text-blue-600'}`}
              >
                <UserIcon className="w-4 h-4" />
                Login
              </button>
            )}

            <a 
              href="tel:+1234567890" 
              className="bg-blue-600 text-white px-6 py-3 rounded-full font-bold hover:bg-blue-700 transition-all flex items-center gap-2 shadow-lg shadow-blue-200"
            >
              <Phone className="w-4 h-4" />
              Emergency
            </a>
          </div>

          {/* Mobile Menu Toggle */}
          <button 
            className="md:hidden p-2"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            {isMenuOpen ? (
              <X className={scrolled ? 'text-blue-900' : 'text-white'} />
            ) : (
              <Menu className={scrolled ? 'text-blue-900' : 'text-white'} />
            )}
          </button>
        </div>

        {/* Mobile Nav */}
        <AnimatePresence>
          {isMenuOpen && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden bg-white border-t border-blue-50 overflow-hidden"
            >
              <div className="px-4 py-8 space-y-6">
                {['Services', 'About', 'Testimonials', 'Contact'].map((item) => (
                  <a 
                    key={item} 
                    href={`#${item.toLowerCase()}`}
                    className="block text-xl font-bold text-blue-900 hover:text-blue-600"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    {item}
                  </a>
                ))}
                
                <div className="pt-6 border-t border-blue-50">
                  {user ? (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <img src={user.photoURL || ''} alt="User" className="w-10 h-10 rounded-full" referrerPolicy="no-referrer" />
                        <span className="font-bold text-blue-900">{user.displayName}</span>
                      </div>
                      <button onClick={handleLogout} className="text-red-500 font-bold flex items-center gap-2">
                        <LogOut className="w-5 h-5" /> Logout
                      </button>
                    </div>
                  ) : (
                    <button onClick={handleLogin} className="w-full py-4 rounded-xl border-2 border-blue-600 text-blue-600 font-bold flex items-center justify-center gap-2">
                      <UserIcon className="w-5 h-5" /> Login with Google
                    </button>
                  )}
                </div>

                <a 
                  href="tel:+1234567890" 
                  className="w-full bg-blue-600 text-white px-5 py-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-xl shadow-blue-200"
                >
                  <Phone className="w-6 h-6" />
                  Emergency Call
                </a>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* Hero Section */}
      <section className="relative h-screen min-h-[700px] flex items-center overflow-hidden">
        {/* Background Image with Overlay */}
        <div className="absolute inset-0 z-0">
          <img 
            src="https://images.unsplash.com/photo-1581244277943-fe4a9c777189?auto=format&fit=crop&q=80&w=2000" 
            alt="Plumbing Background" 
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-blue-900/40"></div>
          <div className="absolute inset-0 bg-gradient-to-r from-blue-950/95 via-blue-950/80 to-transparent"></div>
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="max-w-2xl"
          >
            <span className="inline-block bg-white/10 text-white px-4 py-2 rounded-full text-sm font-bold tracking-wider uppercase mb-8 backdrop-blur-md border border-white/30">
              Licensed & Insured Plumbing Experts
            </span>
            <h1 className="text-6xl md:text-8xl font-bold text-white leading-tight mb-8">
              Expert Plumbing <br />
              <span className="text-blue-400">Solutions</span>
            </h1>
            <p className="text-2xl text-blue-100 mb-12 leading-relaxed font-medium">
              Reliable, high-quality plumbing services for your home and business. 
              Available 24/7 for emergencies.
            </p>
            <div className="flex flex-col sm:flex-row gap-6">
              <a 
                href="#contact" 
                className="bg-white text-blue-600 px-10 py-5 rounded-full font-bold text-xl hover:bg-blue-50 transition-all flex items-center justify-center gap-3 group shadow-2xl shadow-white/10"
              >
                Book a Service
                <ArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
              </a>
              <a 
                href="#services" 
                className="bg-blue-600/30 backdrop-blur-md text-white border-2 border-white/30 px-10 py-5 rounded-full font-bold text-xl hover:bg-white/10 transition-all flex items-center justify-center"
              >
                Our Services
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Services Section */}
      <section id="services" className="py-32 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-24">
            <h2 className="text-blue-600 font-bold uppercase tracking-widest text-sm mb-4">What We Do</h2>
            <h3 className="text-5xl md:text-6xl font-bold text-blue-950 mb-8">Professional Services</h3>
          </div>

          <div className="grid md:grid-cols-3 gap-12">
            {services.map((service, idx) => (
              <motion.div 
                key={idx}
                whileHover={{ y: -15 }}
                className="p-12 bg-white rounded-[40px] border-2 border-blue-50 hover:border-blue-600 hover:shadow-[0_20px_50px_rgba(37,99,235,0.1)] transition-all group min-h-[400px] flex flex-col justify-center"
              >
                <div className="bg-blue-50 w-24 h-24 rounded-3xl flex items-center justify-center mb-10 shadow-sm group-hover:bg-blue-600 transition-colors">
                  <div className="group-hover:text-white transition-colors text-blue-600">
                    {service.icon}
                  </div>
                </div>
                <h4 className="text-3xl font-bold text-blue-950 mb-6">{service.title}</h4>
                <p className="text-blue-900/70 leading-relaxed text-xl">
                  {service.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* About Section */}
      <section id="about" className="py-32 bg-blue-50 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row items-center gap-24">
            <div className="lg:w-1/2 relative">
              <div className="relative z-10 rounded-[40px] overflow-hidden shadow-2xl">
                <img 
                  src="https://images.unsplash.com/photo-1504148455328-43627677929e?auto=format&fit=crop&q=80&w=1000" 
                  alt="Plumber at work" 
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div className="absolute -top-10 -left-10 w-48 h-48 bg-blue-600 rounded-[40px] -z-0"></div>
            </div>

            <div className="lg:w-1/2">
              <h2 className="text-blue-600 font-bold uppercase tracking-widest text-sm mb-4">About FlowMaster</h2>
              <h3 className="text-5xl md:text-6xl font-bold text-blue-950 mb-8">Quality & Honesty</h3>
              <p className="text-xl text-blue-900/70 mb-12 leading-relaxed">
                Founded in 2010, FlowMaster Plumbing has been serving the community with a 
                commitment to excellence. We believe in doing the job right the first time.
              </p>
              
              <div className="space-y-6 mb-12">
                {[
                  "Family owned and operated",
                  "Upfront pricing with no surprises",
                  "Clean and respectful technicians",
                  "Satisfaction guaranteed"
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <div className="bg-blue-600 rounded-full p-1">
                      <CheckCircle2 className="w-6 h-6 text-white" />
                    </div>
                    <span className="text-blue-950 font-bold text-2xl">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-32 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-24">
            <h2 className="text-blue-600 font-bold uppercase tracking-widest text-sm mb-4">Testimonials</h2>
            <h3 className="text-5xl font-bold text-blue-950">Customer Reviews</h3>
          </div>

          <div className="grid md:grid-cols-3 gap-12">
            {testimonials.map((t, i) => (
              <div key={i} className="bg-blue-50 p-12 rounded-[40px] relative min-h-[400px] flex flex-col justify-between border-2 border-transparent hover:border-blue-200 transition-all">
                <div>
                  <div className="flex text-blue-600 mb-8">
                    {[...Array(t.rating)].map((_, i) => <Star key={i} className="w-6 h-6 fill-current" />)}
                  </div>
                  <p className="text-blue-950 italic mb-10 text-2xl leading-relaxed font-medium">"{t.content}"</p>
                </div>
                <div className="flex items-center gap-5">
                  <div className="w-16 h-16 rounded-full bg-white overflow-hidden border-4 border-white shadow-md">
                    <img src={`https://i.pravatar.cc/100?img=${i+20}`} alt={t.name} referrerPolicy="no-referrer" />
                  </div>
                  <div>
                    <h4 className="font-bold text-blue-950 text-xl">{t.name}</h4>
                    <p className="text-sm text-blue-600 font-bold uppercase tracking-widest">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="py-32 bg-blue-950 text-white relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="flex flex-col lg:flex-row gap-24">
            <div className="lg:w-1/2">
              <h2 className="text-blue-400 font-bold uppercase tracking-widest text-sm mb-4">Contact Us</h2>
              <h3 className="text-5xl md:text-6xl font-bold mb-10">Get a Free Quote</h3>
              <p className="text-blue-200/70 text-xl mb-16 leading-relaxed">
                Fill out the form and our team will get back to you within 2 hours. 
                For emergencies, please call us directly.
              </p>

              <div className="space-y-12">
                <div className="flex items-start gap-8">
                  <div className="bg-blue-600 p-5 rounded-3xl">
                    <Phone className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h4 className="font-bold text-2xl mb-2">Phone</h4>
                    <p className="text-blue-200 text-xl">(555) 123-4567</p>
                    <p className="text-blue-400 text-sm font-bold mt-2 uppercase tracking-widest">24/7 Emergency Line</p>
                  </div>
                </div>
                <div className="flex items-start gap-8">
                  <div className="bg-blue-600 p-5 rounded-3xl">
                    <Mail className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h4 className="font-bold text-2xl mb-2">Email</h4>
                    <p className="text-blue-200 text-xl">service@flowmaster.com</p>
                  </div>
                </div>
              </div>

              {user && bookings.length > 0 && (
                <div className="mt-20 p-8 bg-white/5 rounded-3xl border border-white/10 backdrop-blur-sm">
                  <h4 className="font-bold text-2xl mb-6 flex items-center gap-3">
                    <Calendar className="w-6 h-6 text-blue-400" />
                    Your Bookings
                  </h4>
                  <div className="space-y-4">
                    {bookings.map((booking) => (
                      <div key={booking.id} className="flex justify-between items-center p-4 bg-white/5 rounded-xl border border-white/5">
                        <div>
                          <p className="font-bold text-blue-100">{booking.serviceType}</p>
                          <p className="text-xs text-blue-200/50">{booking.createdAt?.toDate().toLocaleDateString()}</p>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest ${
                          booking.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
                          booking.status === 'confirmed' ? 'bg-blue-500/20 text-blue-400' :
                          'bg-green-500/20 text-green-400'
                        }`}>
                          {booking.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="lg:w-1/2">
              <div className="bg-white p-12 md:p-16 rounded-[50px] shadow-2xl">
                {formStatus === 'success' ? (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-center py-16"
                  >
                    <div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-8">
                      <CheckCircle2 className="w-12 h-12 text-blue-600" />
                    </div>
                    <h4 className="text-3xl font-bold text-blue-950 mb-4">Message Sent!</h4>
                    <p className="text-blue-900/60 text-lg">We'll get back to you shortly.</p>
                  </motion.div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-8">
                    {!user && (
                      <div className="p-6 bg-blue-50 rounded-2xl border-2 border-blue-100 text-center">
                        <p className="text-blue-900 font-bold mb-4">Login to book a service and track your requests</p>
                        <button 
                          type="button"
                          onClick={handleLogin}
                          className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-700 transition-all flex items-center justify-center gap-2 mx-auto"
                        >
                          <UserIcon className="w-5 h-5" /> Login with Google
                        </button>
                      </div>
                    )}
                    
                    <div className="space-y-6 opacity-100 disabled:opacity-50">
                      <div>
                        <label className="block text-sm font-bold text-blue-900 mb-3 uppercase tracking-widest">Service Type</label>
                        <select 
                          name="serviceType"
                          disabled={!user}
                          className="w-full bg-blue-50 border-2 border-blue-50 rounded-2xl px-6 py-4 text-blue-950 font-bold focus:outline-none focus:border-blue-600 transition-all appearance-none"
                        >
                          <option>Emergency Repair</option>
                          <option>Installation</option>
                          <option>Maintenance</option>
                          <option>Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-blue-900 mb-3 uppercase tracking-widest">Message</label>
                        <textarea 
                          name="message"
                          required
                          disabled={!user}
                          rows={4}
                          className="w-full bg-blue-50 border-2 border-blue-50 rounded-2xl px-6 py-4 text-blue-950 font-medium focus:outline-none focus:border-blue-600 transition-all"
                          placeholder="Tell us about your plumbing needs..."
                        ></textarea>
                      </div>
                      <button 
                        disabled={formStatus === 'submitting' || !user}
                        type="submit" 
                        className="w-full bg-blue-600 text-white font-bold py-5 rounded-2xl hover:bg-blue-700 transition-all flex items-center justify-center gap-3 disabled:opacity-50 shadow-xl shadow-blue-600/20 text-xl"
                      >
                        {formStatus === 'submitting' ? (
                          <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
                        ) : (
                          <>
                            Book Now
                            <ArrowRight className="w-6 h-6" />
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-blue-950 text-white py-24 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-16 mb-20">
            <div className="col-span-2">
              <div className="flex items-center gap-3 mb-8">
                <div className="bg-blue-600 p-2.5 rounded-xl">
                  <Droplets className="w-8 h-8 text-white" />
                </div>
                <span className="text-3xl font-bold tracking-tight">FlowMaster</span>
              </div>
              <p className="text-blue-200/60 max-w-md mb-10 text-lg leading-relaxed">
                Your trusted partner for all plumbing needs. Professional service, 
                honest pricing, and quality workmanship since 2010.
              </p>
              <div className="flex gap-6">
                {[Facebook, Twitter, Instagram].map((Icon, i) => (
                  <a key={i} href="#" className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center hover:bg-blue-600 transition-all group">
                    <Icon className="w-6 h-6 group-hover:scale-110 transition-transform" />
                  </a>
                ))}
              </div>
            </div>

            <div>
              <h4 className="font-bold text-xl mb-8">Quick Links</h4>
              <ul className="space-y-5 text-blue-200/60 text-lg">
                <li><a href="#services" className="hover:text-blue-400 transition-colors">Services</a></li>
                <li><a href="#about" className="hover:text-blue-400 transition-colors">About Us</a></li>
                <li><a href="#testimonials" className="hover:text-blue-400 transition-colors">Testimonials</a></li>
                <li><a href="#contact" className="hover:text-blue-400 transition-colors">Contact</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold text-xl mb-8">Working Hours</h4>
              <ul className="space-y-5 text-blue-200/60 text-lg">
                <li className="flex justify-between">
                  <span>Mon - Fri</span>
                  <span className="text-white font-bold">8am - 6pm</span>
                </li>
                <li className="flex justify-between">
                  <span>Saturday</span>
                  <span className="text-white font-bold">9am - 4pm</span>
                </li>
                <li className="flex justify-between">
                  <span>Sunday</span>
                  <span className="text-blue-400 font-bold uppercase tracking-widest text-sm">Emergency Only</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="pt-12 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-6 text-blue-200/40 text-sm font-medium">
            <p>© 2026 FlowMaster Plumbing. All rights reserved.</p>
            <div className="flex gap-10">
              <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
