from sqlalchemy import Column, Integer, String, Boolean, ForeignKey
from sqlalchemy.orm import relationship

from core.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    email = Column(String, unique=True, index=True)
    password_hash = Column(String)
    role = Column(String, default="user")  # "user" | "admin"

    media_items = relationship("MediaItem", back_populates="user")

class MediaItem(Base):
    __tablename__ = "media_items"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    original_object_name = Column(String)
    original_url = Column(String)
    original_filename = Column(String)

    processed = Column(Boolean, default=False)
    processed_url = Column(String, nullable=True)
    description = Column(String, nullable=True)

    processed_object_name = Column(String, nullable=True)

    user = relationship("User", back_populates="media_items")