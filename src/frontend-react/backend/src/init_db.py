from .database import engine, Base
from .models import User, Itinerary

def init_db():
    Base.metadata.create_all(bind=engine)
    print("Database tables created!")

if __name__ == "__main__":
    init_db()
