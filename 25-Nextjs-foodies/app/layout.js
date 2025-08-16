import MainHeader from './components/main-header/main-header';
import './globals.css';

export const metadata = {
  title: 'All Meals',
  description: 'Browese the delicious meals shared by our community',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <MainHeader/>
        {children}
      </body>
    </html>
  );
}
